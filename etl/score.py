"""Partner Fit Score (PLAN.md §5 / spec §5.2).

A transparent weighted blend (weights in config.SCORE_WEIGHTS):
  30% topic relevance · 20% publication activity · 20% EU-project participation
  15% network centrality · 10% country/consortium diversity · 5% recent activity

Each component is normalised to 0..1, blended, scaled to 0..100, and the
per-component contributions are stored as `score_breakdown` for the "why" panel.
"""
import config


def partner_fit_score(components: dict) -> tuple[float, dict]:
    """components: {key: 0..1}. Returns (score_0_100, breakdown)."""
    weights = config.SCORE_WEIGHTS
    breakdown = {k: round(weights[k] * components.get(k, 0.0) * 100, 1) for k in weights}
    return round(sum(breakdown.values()), 1), breakdown
