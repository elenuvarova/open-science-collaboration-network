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
from embed import embed_topic
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
        # One bulk ON CONFLICT … RETURNING instead of a per-row upsert+flush —
        # the latter is thousands of round-trips to remote Neon (minutes).
        print("Step 2/6  Upserting institutions…")
        inst_rows = [
            {
                "openalex_id": oa_id,
                "name": inst["name"],
                "normalized_name": normalize_name(inst["name"]),
                "country": (inst.get("country") or "").upper(),
                "type": inst.get("type") or "unknown",
                "ror_id": inst.get("ror_id") or None,
            }
            for oa_id, inst in sorted(all_institutions.items())
        ]
        oa_inst_id_map: dict[str, int] = load.bulk_upsert_institutions(db, inst_rows)

        # ── 3. CORDIS ────────────────────────────────────────────────────────
        print("Step 3/6  CORDIS projects + entity matching…")

        # Pass topic-specific cordis keywords to the filter
        import sources.cordis as cordis_mod
        orig_keywords = cordis_mod.CLIMATE_KEYWORDS
        cordis_mod.CLIMATE_KEYWORDS = topic_cfg.get("cordis_keywords", topic_cfg["keywords"])

        by_ror, by_country = build_openalex_index(list(all_institutions.values()))

        # Collect everything in memory (matching is local/fast after the ROR fix),
        # then write projects + participants in bulk — no per-row upsert/flush.
        proj_rows: dict[str, dict] = {}        # cordis_id → project row (deduped)
        proj_matches: list[tuple[str, list[tuple[int, str]]]] = []  # (cordis_id, [(inst_db_id, role)])
        matched = unmatched = 0
        for proj in fetch_projects():
            cid = proj["cordis_id"]
            proj_rows[cid] = {k: v for k, v in proj.items() if k != "participants"}
            parts: list[tuple[int, str]] = []
            for p in proj["participants"]:
                inst_dict, confidence, _ = best_match(p["name"], p["country"], by_ror, by_country)
                if inst_dict and confidence >= 75:
                    db_id = oa_inst_id_map.get(inst_dict["openalex_id"])
                    if db_id:
                        parts.append((db_id, p["role"]))
                        matched += 1
                        continue
                unmatched += 1
            proj_matches.append((cid, parts))

        cordis_mod.CLIMATE_KEYWORDS = orig_keywords  # restore

        cid_to_pid = load.bulk_upsert_projects(db, list(proj_rows.values()))

        participant_rows: list[dict] = []
        project_participants_db: list[list[int]] = []
        seen_pp: set[tuple[int, int]] = set()
        for cid, parts in proj_matches:
            pid = cid_to_pid.get(cid)
            if not pid:
                continue
            ids_here: list[int] = []
            for db_id, role in parts:
                key = (pid, db_id)
                if key in seen_pp:
                    continue
                seen_pp.add(key)
                participant_rows.append({"project_id": pid, "institution_id": db_id, "role": role})
                ids_here.append(db_id)
            if len(ids_here) > 1:
                project_participants_db.append(ids_here)

        load.insert_project_participants(db, participant_rows)
        print(f"  → {len(proj_rows)} projects, {matched} matched orgs, {unmatched} unmatched")

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

        metric_rows = []
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
            metric_rows.append({
                "institution_id": db_id,
                "topic_id": topic.id,
                "degree_centrality": m.get("degree_centrality", 0.0),
                "betweenness": m.get("betweenness", 0.0),
                "community_id": m.get("community_id"),
                "partner_fit_score": score,
                "score_breakdown": breakdown,
                "recent_works": wc,
                "eu_projects": pc,
            })
        load.replace_topic_metrics(db, topic.id, metric_rows)

        # ── 6. Collaboration edges (per-topic) ────────────────────────────────
        print("Step 6/6  Writing edges…")
        # Edges are topic-scoped: clear only THIS topic's edges, never other
        # topics' — institutions are shared across topics, so deleting by node
        # would clobber edges that belong to a different topic's graph.
        db.query(CollaborationEdge).filter(
            CollaborationEdge.topic_id == topic.id
        ).delete(synchronize_session=False)
        for src, tgt, data in G.edges(data=True):
            load.add_edge(db, src, tgt, topic.id, data.get("type", "coauthor"), data.get("weight", 1.0))

        db.commit()
        print(f"  Done — {len(oa_inst_id_map)} institutions, {len(G.edges)} edges")

        # ── 7. Embeddings + AI brief ──────────────────────────────────────────
        print("Step 7/7  Embeddings + AI brief…")
        embed_db = load.SessionLocal()
        try:
            embed_topic(embed_db, name)
            embed_db.commit()
        except Exception as e:
            embed_db.rollback()
            print(f"  embed: error (non-fatal): {e}")
        finally:
            embed_db.close()

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
