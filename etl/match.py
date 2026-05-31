"""Entity matching: CORDIS organisation ↔ OpenAlex institution.

No shared ID exists. Strategy (PLAN.md §5 step 4 — the highest-risk workstream):
  1. normalise names (normalize.py)
  2. block by country (only compare same-country candidates)
  3. rapidfuzz token_sort_ratio / WRatio within blocks
  4. store a per-match confidence; queue mid-confidence for manual review
  5. prefer the ROR pivot when available (sources/ror.py)

TODO (Phase 2): implement blocking + rapidfuzz scoring + thresholds.
"""
from normalize import normalize_name

HIGH_CONFIDENCE = 90
REVIEW_FLOOR = 75


def best_match(cordis_name, country, openalex_candidates):
    """Return (institution_id, confidence) or (None, 0). STUB — Phase 2."""
    _ = normalize_name(cordis_name)
    raise NotImplementedError("match.best_match — implement in Phase 2")
