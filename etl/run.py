"""ETL orchestrator.

Run from etl/ (env loaded from ../.env or GitHub Actions secrets):
  python run.py                          # all topics in config.TOPICS
  python run.py "AI in education"        # one specific topic
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from collections import defaultdict

import config
import load
from graph import build_graph
from match import best_match, build_openalex_index
from models import CollaborationEdge
from normalize import normalize_name
from score import partner_fit_score
from sources.cordis import fetch_projects
from sources.openalex import fetch_works


def run_topic(topic_cfg: dict):
    """Run the full pipeline for one topic dict from config.TOPICS."""
    name = topic_cfg["name"]
    print(f"\n{'='*60}")
    print(f"ETL topic: {name}")
    print(f"{'='*60}")

    # Temporarily override module-level config used by fetch_works / fetch_projects
    config.TOPIC_NAME = name
    config.TOPIC_SEARCH = topic_cfg["search"]
    config.TOPIC_KEYWORDS = topic_cfg["keywords"]

    load.init_schema()
    db = load.SessionLocal()

    try:
        topic = load.get_or_create_topic(db, name, topic_cfg["keywords"])
        db.flush()

        # ── 1. OpenAlex ──────────────────────────────────────────────────────
        print("Step 1/6  OpenAlex works…")
        all_institutions: dict[str, dict] = {}
        authorships_by_work: list[list[str]] = []

        for w in fetch_works():
            for inst in w["institutions"]:
                iid = inst["openalex_id"]
                if iid not in all_institutions:
                    all_institutions[iid] = inst
            inst_ids = list({iid for auth in w["authorships"] for iid in auth["institution_openalex_ids"]})
            if len(inst_ids) > 1:
                authorships_by_work.append(inst_ids)

        print(f"  → {len(authorships_by_work)} co-authorship works, {len(all_institutions)} institutions")

        # ── 2. Upsert institutions ────────────────────────────────────────────
        # Sort by openalex_id so all parallel processes acquire row-locks in the
        # same order — prevents deadlocks when multiple topics run concurrently.
        print("Step 2/6  Upserting institutions…")
        oa_inst_id_map: dict[str, int] = {}
        for oa_id, inst in sorted(all_institutions.items()):
            db_inst = load.upsert_institution(
                db,
                openalex_id=oa_id,
                name=inst["name"],
                normalized_name=normalize_name(inst["name"]),
                country=(inst.get("country") or "").upper(),
                type=inst.get("type") or "unknown",
                ror_id=inst.get("ror_id") or None,
            )
            db.flush()
            oa_inst_id_map[oa_id] = db_inst.id

        # ── 3. CORDIS ────────────────────────────────────────────────────────
        print("Step 3/6  CORDIS projects + entity matching…")

        # Pass topic-specific cordis keywords to the filter
        import sources.cordis as cordis_mod
        orig_keywords = cordis_mod.CLIMATE_KEYWORDS
        cordis_mod.CLIMATE_KEYWORDS = topic_cfg.get("cordis_keywords", topic_cfg["keywords"])

        by_ror, by_country = build_openalex_index(list(all_institutions.values()))
        project_participants_db: list[list[int]] = []
        projects_added = matched = unmatched = 0

        for proj in fetch_projects():
            db_proj = load.upsert_project(db, **{k: v for k, v in proj.items() if k != "participants"})
            db.flush()
            projects_added += 1
            participant_db_ids: list[int] = []
            for p in proj["participants"]:
                inst_dict, confidence, _ = best_match(p["name"], p["country"], by_ror, by_country)
                if inst_dict and confidence >= 75:
                    db_id = oa_inst_id_map.get(inst_dict["openalex_id"])
                    if db_id:
                        load.upsert_project_participant(db, db_proj.id, db_id, p["role"])
                        participant_db_ids.append(db_id)
                        matched += 1
                else:
                    unmatched += 1
            if len(participant_db_ids) > 1:
                project_participants_db.append(participant_db_ids)

        cordis_mod.CLIMATE_KEYWORDS = orig_keywords  # restore
        print(f"  → {projects_added} projects, {matched} matched orgs, {unmatched} unmatched")

        # ── 4. Graph metrics ──────────────────────────────────────────────────
        print("Step 4/6  Graph metrics…")
        db_authorships = [
            [oa_inst_id_map[oid] for oid in ids if oid in oa_inst_id_map]
            for ids in authorships_by_work
        ]
        G, metrics = build_graph(db_authorships, project_participants_db)
        print(f"  → {len(G.nodes)} nodes, {len(G.edges)} edges")

        # ── 5. Partner Fit Score ──────────────────────────────────────────────
        print("Step 5/6  Partner Fit Scores…")
        work_counts: dict[str, int] = defaultdict(int)
        for ids in authorships_by_work:
            for oid in ids:
                work_counts[oid] += 1
        project_counts: dict[int, int] = defaultdict(int)
        for ids in project_participants_db:
            for db_id in ids:
                project_counts[db_id] += 1

        max_works_val = max(work_counts.values(), default=1)
        max_degree = max((m["degree_centrality"] for m in metrics.values()), default=1) or 1
        max_projects = max(project_counts.values(), default=1)

        for oa_id, db_id in oa_inst_id_map.items():
            m = metrics.get(db_id, {})
            wc = work_counts.get(oa_id, 0)
            pc = project_counts.get(db_id, 0)
            country = (all_institutions[oa_id].get("country") or "").upper()
            components = {
                "topic_relevance": min(wc / max(max_works_val * 0.1, 1), 1.0),
                "publication_activity": min(wc / max_works_val, 1.0),
                "eu_project_participation": min(pc / max_projects, 1.0),
                "network_centrality": m.get("degree_centrality", 0.0) / max_degree,
                "country_diversity": 1.0 if country in config.FOCUS_COUNTRIES else 0.5,
                "recent_activity": 1.0,
            }
            score, breakdown = partner_fit_score(components)
            load.set_metric(
                db, db_id, topic.id,
                degree_centrality=m.get("degree_centrality", 0.0),
                betweenness=m.get("betweenness", 0.0),
                community_id=m.get("community_id"),
                partner_fit_score=score,
                score_breakdown=breakdown,
                recent_works=wc,
                eu_projects=pc,
            )

        # ── 6. Collaboration edges (per-topic, append) ────────────────────────
        print("Step 6/6  Writing edges…")
        # Delete edges only for institutions active in this topic's graph
        node_ids = set(G.nodes)
        if node_ids:
            db.query(CollaborationEdge).filter(
                CollaborationEdge.source_institution_id.in_(node_ids)
            ).delete(synchronize_session=False)
        for src, tgt, data in G.edges(data=True):
            load.add_edge(db, src, tgt, data.get("type", "coauthor"), data.get("weight", 1.0))

        db.commit()
        print(f"  Done — {len(oa_inst_id_map)} institutions, {len(G.edges)} edges")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main():
    requested = sys.argv[1] if len(sys.argv) > 1 else None

    if requested:
        matches = [t for t in config.TOPICS if t["name"].lower() == requested.lower()]
        if not matches:
            names = [t["name"] for t in config.TOPICS]
            print(f"Unknown topic '{requested}'. Available: {names}")
            sys.exit(1)
        topics_to_run = matches
    else:
        topics_to_run = config.TOPICS

    load.init_schema()
    for topic_cfg in topics_to_run:
        run_topic(topic_cfg)

    print(f"\nAll done — {len(topics_to_run)} topic(s) ingested.")


if __name__ == "__main__":
    main()
