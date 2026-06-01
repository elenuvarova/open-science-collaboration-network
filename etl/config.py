"""ETL configuration.

Each topic in TOPICS will be ingested as a separate graph in the DB.
Run:
  python run.py                          # all topics
  python run.py "AI in education"        # one topic
"""

CONTINENT = "europe"
FOCUS_COUNTRIES = ["BE", "GB", "NL", "FR", "DE", "SE", "NO", "DK", "FI", "IT", "ES", "PL", "CH", "AT"]
YEAR_FROM = 2020
YEAR_TO = 2025
MAX_WORKS = 1000

CORDIS_DATASETS = {
    "HORIZON": "https://cordis.europa.eu/data/cordis-HORIZONprojects-csv.zip",
    "H2020": "https://cordis.europa.eu/data/cordis-h2020projects-csv.zip",
}

SCORE_WEIGHTS = {
    "topic_relevance": 0.30,
    "publication_activity": 0.20,
    "eu_project_participation": 0.20,
    "network_centrality": 0.15,
    "country_diversity": 0.10,
    "recent_activity": 0.05,
}

TOPICS = [
    {
        "name": "Climate adaptation",
        "search": "climate adaptation",
        "keywords": ["climate adaptation", "climate resilience", "urban heat",
                     "flood risk", "drought", "coastal adaptation"],
        "cordis_keywords": ["climate adapt", "climate resilien", "flood", "drought",
                            "heat wave", "coastal adapt", "urban heat", "sea level",
                            "extreme weather"],
    },
    {
        "name": "AI in education",
        "search": "artificial intelligence education",
        "keywords": ["AI in education", "learning analytics", "adaptive learning",
                     "AI tutoring", "educational technology", "intelligent tutoring"],
        "cordis_keywords": ["artificial intelligence", "machine learning", "adaptive learning",
                            "learning analytics", "educational technolog", "ai tutor",
                            "personali", "digital education"],
    },
    {
        "name": "Soil health",
        "search": "soil health",
        "keywords": ["soil health", "soil microbiome", "soil carbon",
                     "regenerative agriculture", "soil biodiversity", "soil quality"],
        "cordis_keywords": ["soil health", "soil microbiom", "soil carbon", "soil qualit",
                            "soil biodiversit", "regenerative agri", "soil organic"],
    },
    {
        "name": "Circular economy",
        "search": "circular economy",
        "keywords": ["circular economy", "waste reduction", "recycling", "closed-loop",
                     "sustainable production", "industrial symbiosis"],
        "cordis_keywords": ["circular econom", "recycl", "waste reduction", "closed-loop",
                            "industrial symbios", "sustainable production"],
    },
    {
        "name": "Digital health",
        "search": "digital health technology",
        "keywords": ["digital health", "mHealth", "telemedicine", "health informatics",
                     "electronic health records", "wearable health", "remote patient monitoring"],
        "cordis_keywords": ["digital health", "mhealth", "telemedicin", "health informatic",
                            "electronic health", "wearable health", "remote patient",
                            "ehealth", "e-health"],
    },
    {
        "name": "Biodiversity conservation",
        "search": "biodiversity conservation",
        "keywords": ["biodiversity conservation", "species extinction", "habitat loss",
                     "ecosystem services", "wildlife conservation", "protected areas"],
        "cordis_keywords": ["biodiversit", "species extinc", "habitat loss",
                            "ecosystem service", "wildlife conserv", "protected area",
                            "nature restor"],
    },
]

# Active topic for single-topic runs (overridden by run.py args)
TOPIC_NAME = TOPICS[0]["name"]
TOPIC_SEARCH = TOPICS[0]["search"]
TOPIC_KEYWORDS = TOPICS[0]["keywords"]
