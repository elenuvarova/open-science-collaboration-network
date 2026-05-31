"""Entity matching: CORDIS organisation → OpenAlex institution.

Strategy (PLAN.md §5):
  1. Try ROR pivot: CORDIS name → ROR API → ROR ID → lookup in openalex_by_ror
  2. Fall back to rapidfuzz within same-country block
  3. Store confidence; flag mid-confidence for review
"""
from rapidfuzz import fuzz

from normalize import normalize_name
from sources.ror import match_to_ror

HIGH = 90
REVIEW_FLOOR = 75


def build_openalex_index(institutions: list[dict]) -> tuple[dict, dict]:
    """Return (by_ror, by_country_name).

    by_ror:          {ror_id: institution_dict}
    by_country_name: {country: [(normalized_name, institution_dict)]}
    """
    by_ror: dict = {}
    by_country: dict = {}

    for inst in institutions:
        ror = (inst.get("ror_id") or "").rstrip("/")
        if ror:
            by_ror[ror] = inst

        country = (inst.get("country") or "").upper()
        norm = normalize_name(inst.get("name", ""))
        by_country.setdefault(country, []).append((norm, inst))

    return by_ror, by_country


def best_match(
    cordis_name: str,
    country: str,
    by_ror: dict,
    by_country: dict,
) -> tuple[dict | None, float, str]:
    """Return (institution_dict_or_None, confidence_0_100, method)."""
    # --- 1. ROR pivot (most reliable) ---
    ror_id = match_to_ror(cordis_name, country)
    if ror_id:
        ror_clean = ror_id.rstrip("/")
        inst = by_ror.get(ror_clean)
        if inst:
            return inst, 95.0, "ror"

    # --- 2. rapidfuzz within country block ---
    norm = normalize_name(cordis_name)
    candidates = by_country.get(country.upper(), [])
    best_score, best_inst = 0.0, None
    for cand_norm, cand_inst in candidates:
        score = fuzz.WRatio(norm, cand_norm)
        if score > best_score:
            best_score, best_inst = score, cand_inst

    if best_score >= HIGH:
        return best_inst, best_score, "fuzzy_high"
    if best_score >= REVIEW_FLOOR:
        return best_inst, best_score, "fuzzy_review"

    return None, 0.0, "unmatched"
