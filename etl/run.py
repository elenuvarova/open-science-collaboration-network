"""ETL orchestrator — Phase 3.

Run from etl/:  python run.py
Env vars loaded from ../.env (or GitHub Actions secrets).

Pipeline:
  1. OpenAlex → works + institutions + authorships
  2. CORDIS   → projects + participants
  3. Normalize + ROR/rapidfuzz match (CORDIS orgs → OpenAlex institutions)
  4. networkx graph → centrality + Louvain communities
  5. Partner Fit Score
  6. Upsert everything into Postgres (Neon) / SQLite
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
from normalize import normalize_name
from score import partner_fit_score
from sources.cordis import fetch_projects
from sources.openalex import fetch_works


def main():
    print(f"ETL start — topic: {config.TOPIC_NAME}")
    load.init_schema()
    db = load.SessionLocal()

    try:
        # ── 1. Seed / get topic ───────────────────────────────────────────────
        topic = load.get_or_create_topic(db, config.TOPIC_NAME, config.TOPIC_KEYWORDS)
        db.flush()

        # ── 2. OpenAlex pull ──────────────────────────────────────────────────
        print("Step 1/6  OpenAlex works…")
        all_institutions: dict[str, dict] = {}  # openalex_id → inst dict
        authorships_by_work: list[list[str]] = []  # for graph edges

        work_count = 0
        for w in fetch_works():
            for inst in w["institutions"]:
                iid = inst["openalex_id"]
                if iid not in all_institutions:
                    all_institutions[iid] = inst

            inst_ids_in_work = list({
                iid
                for auth in w["authorships"]
                for iid in auth["institution_openalex_ids"]
            })
            if len(inst_ids_in_work) > 1:
                authorships_by_work.append(inst_ids_in_work)

            work_count += 1

        print(f"  → {work_count} works, {len(all_institutions)} unique institutions")

        # ── 3. Upsert OpenAlex institutions ───────────────────────────────────
        print("Step 2/6  Upserting institutions…")
        oa_inst_id_map: dict[str, int] = {}  # openalex_id → DB pk

        for oa_id, inst in all_institutions.items():
            ror = (inst.get("ror_id") or "").replace("https://ror.org/", "")
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

        print(f"  → {len(oa_inst_id_map)} institutions in DB")

        # ── 4. CORDIS pull + match ────────────────────────────────────────────
        print("Step 3/6  CORDIS projects + entity matching…")
        by_ror, by_country = build_openalex_index(list(all_institutions.values()))

        project_participants_db: list[list[int]] = []  # DB pks for graph
        projects_added = 0
        matched = unmatched = 0

        for proj in fetch_projects():
            db_proj = load.upsert_project(db, **{
                k: v for k, v in proj.items() if k != "participants"
            })
            db.flush()
            projects_added += 1

            participant_db_ids: list[int] = []
            for p in proj["participants"]:
                inst_dict, confidence, method = best_match(
                    p["name"], p["country"], by_ror, by_country
                )
                if inst_dict and confidence >= 75:
                    oa_id = inst_dict["openalex_id"]
                    db_id = oa_inst_id_map.get(oa_id)
                    if db_id:
                        load.upsert_project_participant(db, db_proj.id, db_id, p["role"])
                        participant_db_ids.append(db_id)
                        matched += 1
                else:
                    unmatched += 1

            if len(participant_db_ids) > 1:
                project_participants_db.append(participant_db_ids)

        print(f"  → {projects_added} projects, {matched} org matches, {unmatched} unmatched")

        # ── 5. Graph metrics ──────────────────────────────────────────────────
        print("Step 4/6  Building graph + computing metrics…")
        graph, metrics = build_graph(
            authorships_by_work=[
                [oa_inst_id_map[oid] for oid in ids if oid in oa_inst_id_map]
                for ids in authorships_by_work
            ],
            project_participants=project_participants_db,
        )
        print(f"  → {len(graph.nodes)} nodes, {len(graph.edges)} edges")

        # Work counts per institution for scoring
        work_counts: dict[str, int] = defaultdict(int)
        for inst_ids in authorships_by_work:
            for oid in inst_ids:
                work_counts[oid] += 1

        project_counts: dict[int, int] = defaultdict(int)
        for ids in project_participants_db:
            for db_id in ids:
                project_counts[db_id] += 1

        # ── 6. Partner Fit Score + persist ────────────────────────────────────
        print("Step 5/6  Computing Partner Fit Scores…")
        max_works = max(work_counts.values(), default=1)
        max_degree = max((m["degree_centrality"] for m in metrics.values()), default=1) or 1
        max_projects = max(project_counts.values(), default=1)

        for oa_id, db_id in oa_inst_id_map.items():
            m = metrics.get(db_id, {})
            wc = work_counts.get(oa_id, 0)
            pc = project_counts.get(db_id, 0)
            degree = m.get("degree_centrality", 0.0)
            recency = 1.0  # all works are within YEAR_FROM-YEAR_TO window
            country = (all_institutions[oa_id].get("country") or "").upper()
            diversity = 1.0 if country in config.FOCUS_COUNTRIES else 0.5

            components = {
                "topic_relevance": min(wc / max(max_works * 0.1, 1), 1.0),
                "publication_activity": min(wc / max_works, 1.0),
                "eu_project_participation": min(pc / max_projects, 1.0),
                "network_centrality": degree / max_degree,
                "country_diversity": diversity,
                "recent_activity": recency,
            }
            score, breakdown = partner_fit_score(components)

            load.set_metric(
                db, db_id, topic.id,
                degree_centrality=degree,
                betweenness=m.get("betweenness", 0.0),
                community_id=m.get("community_id"),
                partner_fit_score=score,
                score_breakdown=breakdown,
                recent_works=wc,
                eu_projects=pc,
            )

        # ── 7. Collaboration edges ────────────────────────────────────────────
        print("Step 6/6  Writing collaboration edges…")
        # Clear old edges for a clean re-run
        from models import CollaborationEdge
        db.query(CollaborationEdge).delete()

        from graph import build_graph as _bg
        G, _ = _bg(
            authorships_by_work=[
                [oa_inst_id_map[oid] for oid in ids if oid in oa_inst_id_map]
                for ids in authorships_by_work
            ],
            project_participants=project_participants_db,
        )
        for src, tgt, data in G.edges(data=True):
            load.add_edge(db, src, tgt, data.get("type", "coauthor"), data.get("weight", 1.0))

        db.commit()
        print(f"\nETL complete — {len(oa_inst_id_map)} institutions, {len(G.edges)} edges in DB.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
