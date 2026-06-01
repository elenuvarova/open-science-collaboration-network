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
    """Return (institution_dict_or_None, confidence_0_100, method).

    Local fuzzy match runs FIRST because it is in-memory and instant. The ROR
    affiliation API is a network call (~hundreds of ms each) — calling it for
    every CORDIS org, as the old ROR-first version did, meant tens of thousands
    of HTTP requests per topic and was the main ETL timeout cause. So ROR is now
    used only to disambiguate the uncertain band: when fuzzy found a plausible
    but not-confident candidate. Orgs scoring below the review floor are almost
    never in our (much smaller) OpenAlex set, so we skip the network entirely.
    """
    # --- 1. rapidfuzz within country block (local, fast) ---
    norm = normalize_name(cordis_name)
    candidates = by_country.get(country.upper(), [])
    best_score, best_inst = 0.0, None
    for cand_norm, cand_inst in candidates:
        score = fuzz.WRatio(norm, cand_norm)
        if score > best_score:
            best_score, best_inst = score, cand_inst

    # Confident local match — no network needed.
    if best_score >= HIGH:
        return best_inst, best_score, "fuzzy_high"

    # --- 2. ROR pivot, only for the uncertain band (bounded # of network calls) ---
    if best_score >= REVIEW_FLOOR:
        ror_id = match_to_ror(cordis_name, country)
        if ror_id:
            inst = by_ror.get(ror_id.rstrip("/"))
            if inst:
                return inst, 95.0, "ror"
        return best_inst, best_score, "fuzzy_review"

    return None, 0.0, "unmatched"
