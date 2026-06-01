"""Dev-only sample data so the API + frontend can be verified end-to-end before
the real ETL (Phase 2) is implemented. Illustrative — NOT real OpenAlex/CORDIS
output. Run: `python seed_sample.py` (from etl/). Replaced by run.py once live.
"""
import load
from score import partner_fit_score

SAMPLE = [
    # (name, country, type, openalex_id, components, eu_projects, recent_works)
    ("KU Leuven", "BE", "university", "I80129705",
     dict(topic_relevance=.92, publication_activity=.85, eu_project_participation=.9,
          network_centrality=.88, country_diversity=.7, recent_activity=.8), 8, 42),
    ("University College London", "GB", "university", "I45129253",
     dict(topic_relevance=.88, publication_activity=.9, eu_project_participation=.6,
          network_centrality=.82, country_diversity=.6, recent_activity=.85), 5, 51),
    ("University of Amsterdam", "NL", "university", "I887064364",
     dict(topic_relevance=.8, publication_activity=.78, eu_project_participation=.7,
          network_centrality=.75, country_diversity=.65, recent_activity=.7), 6, 33),
    ("Deltares", "NL", "company", "I4210114444",
     dict(topic_relevance=.85, publication_activity=.5, eu_project_participation=.95,
          network_centrality=.7, country_diversity=.8, recent_activity=.75), 11, 18),
    ("City of Rotterdam", "NL", "public_body", None,
     dict(topic_relevance=.4, publication_activity=.1, eu_project_participation=.5,
          network_centrality=.45, country_diversity=.6, recent_activity=.5), 3, 2),
]

EDGES = [(0, 1), (0, 2), (0, 3), (2, 3), (3, 4)]  # indices into SAMPLE


def main():
    load.init_schema()
    db = load.SessionLocal()
    try:
        topic = load.get_or_create_topic(db, "Climate adaptation",
                                          ["climate adaptation", "resilience", "flood risk"])
        db.flush()
        ids = []
        for i, (name, country, type_, oa, comps, projects, works) in enumerate(SAMPLE):
            inst = load.upsert_institution(
                db, name=name, normalized_name=name.lower(), country=country,
                type=type_, openalex_id=oa or f"SAMPLE_{i}",
            )
            db.flush()
            ids.append(inst.id)
            score, breakdown = partner_fit_score(comps)
            load.set_metric(
                db, inst.id, topic.id,
                degree_centrality=comps["network_centrality"],
                community_id=0 if type_ == "university" else 1,
                partner_fit_score=score, score_breakdown=breakdown,
                eu_projects=projects, recent_works=works,
            )
        for a, b in EDGES:
            load.add_edge(db, ids[a], ids[b], topic.id, "coauthor", 1.0)
        db.commit()
        print(f"Seeded topic + {len(ids)} institutions + {len(EDGES)} edges.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
