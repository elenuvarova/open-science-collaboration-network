"""Seed configuration for the ETL pipeline.

Scoping the OpenAlex pull tightly (one topic + Europe + recent years) keeps the
run inside OpenAlex's free $1/day allowance. Widen only via the CC0 snapshot.
"""

# --- Seed topic (chosen from OpenAlex density probe; see PLAN.md §0) ---
TOPIC_NAME = "Climate adaptation"
TOPIC_SEARCH = "climate adaptation"
TOPIC_KEYWORDS = [
    "climate adaptation",
    "climate resilience",
    "urban heat",
    "flood risk",
    "drought",
    "coastal adaptation",
]

# --- Geographic + temporal scope ---
CONTINENT = "europe"  # OpenAlex: institutions.continent
FOCUS_COUNTRIES = ["BE", "GB", "NL", "FR", "DE"]  # highlight, not exclude
YEAR_FROM = 2020
YEAR_TO = 2025

# --- Caps (keep the graph legible + within free tiers) ---
MAX_WORKS = 5000          # top works by relevance/citations
TOP_N_INSTITUTIONS = 300  # graph node cap for the MVP (Cytoscape comfort zone)

# --- CORDIS bulk datasets (data.europa.eu) ---
CORDIS_DATASETS = {
    "HORIZON": "https://cordis.europa.eu/data/cordis-HORIZONprojects-csv.zip",
    "H2020": "https://cordis.europa.eu/data/cordis-h2020projects-csv.zip",
}

# --- Partner Fit Score weights (PLAN.md §5 / spec §5.2) ---
SCORE_WEIGHTS = {
    "topic_relevance": 0.30,
    "publication_activity": 0.20,
    "eu_project_participation": 0.20,
    "network_centrality": 0.15,
    "country_diversity": 0.10,
    "recent_activity": 0.05,
}
