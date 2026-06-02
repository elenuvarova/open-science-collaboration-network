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

import bisect
import math
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


def _strip_nul(s: str) -> str:
    """Postgres text columns reject NUL (0x00) bytes; CORDIS/OpenAlex free text
    can contain them. Drop them before insert."""
    return s.replace("\x00", "") if isinstance(s, str) else s


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

    # ── PHASE 1 — gather everything in memory (network + CPU, NO DB session) ───
    # CORDIS download + parsing takes many minutes. Holding an open Neon
    # transaction idle across that gap gets the SSL connection dropped
    # ("connection closed unexpectedly"). So we open the DB session only in
    # phase 2 and do every write in one tight burst.

    # 1. OpenAlex works
    print("Step 1/8  OpenAlex works…")
    all_institutions: dict[str, dict] = {}
    authorships_by_work: list[list[str]] = []
    works_by_id: dict[str, dict] = {}
    inst_work_total: dict[str, int] = defaultdict(int)   # works per institution (topic capacity)
    inst_work_recent: dict[str, int] = defaultdict(int)  # of those, dated >= 2024 (recency)
    for w in fetch_works():
        is_recent = (w.get("year") or 0) >= 2024
        for inst in w["institutions"]:
            iid = inst["openalex_id"]
            if iid not in all_institutions:
                all_institutions[iid] = inst
            inst_work_total[iid] += 1
            if is_recent:
                inst_work_recent[iid] += 1
        inst_ids = list({iid for auth in w["authorships"] for iid in auth["institution_openalex_ids"]})
        if len(inst_ids) > 1:
            authorships_by_work.append(inst_ids)
        wid = w["openalex_id"]
        if w.get("title") and wid not in works_by_id:
            works_by_id[wid] = {
                "openalex_id": wid,
                "title": _strip_nul(w["title"]),
                "year": w.get("year"),
                "abstract": _strip_nul(w.get("abstract") or "") or None,
                "doi": w.get("doi"),
                "cited_by_count": w.get("cited_by_count") or 0,
            }
    print(f"  → {len(works_by_id)} works, {len(authorships_by_work)} co-authorship works, "
          f"{len(all_institutions)} institutions")

    # 2. CORDIS download + entity matching — match to OpenAlex IDs (DB IDs don't
    #    exist yet; they're resolved in phase 2 after institutions are written).
    print("Step 2/8  CORDIS download + entity matching…")
    import sources.cordis as cordis_mod
    orig_keywords = cordis_mod.CLIMATE_KEYWORDS
    cordis_mod.CLIMATE_KEYWORDS = topic_cfg.get("cordis_keywords", topic_cfg["keywords"])
    by_ror, by_country = build_openalex_index(list(all_institutions.values()))
    proj_rows: dict[str, dict] = {}                              # cordis_id → project row (deduped)
    proj_matches: list[tuple[str, list[tuple[str, str]]]] = []   # (cordis_id, [(openalex_id, role)])
    matched = unmatched = 0
    try:
        for proj in fetch_projects():
            cid = proj["cordis_id"]
            row = {k: v for k, v in proj.items() if k != "participants"}
            row["title"] = _strip_nul(row.get("title") or "")
            row["abstract"] = _strip_nul(row.get("abstract") or "")
            proj_rows[cid] = row
            parts: list[tuple[str, str]] = []
            for p in proj["participants"]:
                inst_dict, confidence, _ = best_match(p["name"], p["country"], by_ror, by_country)
                if inst_dict and confidence >= 75:
                    parts.append((inst_dict["openalex_id"], p["role"]))
                    matched += 1
                else:
                    unmatched += 1
            proj_matches.append((cid, parts))
    finally:
        cordis_mod.CLIMATE_KEYWORDS = orig_keywords  # restore even on error

    # ── PHASE 2 — write everything to the DB in one tight burst ────────────────
    db = load.SessionLocal()
    try:
        topic = load.get_or_create_topic(db, name, topic_cfg["keywords"])

        # 3. Institutions + works
        print("Step 3/8  Writing institutions + works…")
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

        work_rows = [{**wr, "topic_id": topic.id} for wr in works_by_id.values()]
        load.bulk_upsert_works(db, work_rows)
        print(f"  → {len(inst_rows)} institutions, {len(work_rows)} works")

        # 4. Projects + participants (resolve matched OpenAlex IDs → DB IDs now)
        print("Step 4/8  Writing projects + participants…")
        cid_to_pid = load.bulk_upsert_projects(db, list(proj_rows.values()))
        participant_rows: list[dict] = []
        project_participants_db: list[list[int]] = []
        seen_pp: set[tuple[int, int]] = set()
        for cid, parts in proj_matches:
            pid = cid_to_pid.get(cid)
            if not pid:
                continue
            ids_here: list[int] = []
            for oa_id, role in parts:
                db_id = oa_inst_id_map.get(oa_id)
                if not db_id:
                    continue
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

        # 5. Graph metrics
        print("Step 5/8  Graph metrics…")
        db_authorships = [
            [oa_inst_id_map[oid] for oid in ids if oid in oa_inst_id_map]
            for ids in authorships_by_work
        ]
        G, metrics = build_graph(db_authorships, project_participants_db)
        print(f"  → {len(G.nodes)} nodes, {len(G.edges)} edges")

        # 6. Partner Fit Score
        print("Step 6/8  Partner Fit Scores…")
        project_counts: dict[int, int] = defaultdict(int)
        for ids in project_participants_db:
            for db_id in ids:
                project_counts[db_id] += 1

        # Percentile-rank normalisation. Dividing heavy-tailed counts by the
        # single maximum crushed everyone into the low end (one leader → 1.0,
        # the rest ≈ 0). Ranking each institution against its topic cohort
        # spreads the score across the full range and reads as "top N% on X".
        oa_ids = list(oa_inst_id_map.keys())
        N = len(oa_ids) or 1
        work_of = {o: inst_work_total.get(o, 0) for o in oa_ids}
        proj_of = {o: project_counts.get(oa_inst_id_map[o], 0) for o in oa_ids}
        deg_of = {o: metrics.get(oa_inst_id_map[o], {}).get("degree_centrality", 0.0) for o in oa_ids}

        def _pct(value_of):
            """oa_id → fraction of the cohort with a strictly smaller value
            (0 for zeros/minimum, ~1 for the top)."""
            ordered = sorted(value_of.values())
            return {o: bisect.bisect_left(ordered, value_of[o]) / N for o in oa_ids}

        pct_work, pct_proj, pct_deg = _pct(work_of), _pct(proj_of), _pct(deg_of)
        max_works_val = max(work_of.values(), default=1) or 1

        metric_rows = []
        for oa_id, db_id in oa_inst_id_map.items():
            m = metrics.get(db_id, {})
            wc = work_of[oa_id]
            pc = proj_of[oa_id]
            recent = inst_work_recent.get(oa_id, 0)
            country = (all_institutions[oa_id].get("country") or "").upper()
            components = {
                "topic_relevance": pct_work[oa_id],
                "publication_activity": math.log1p(wc) / math.log1p(max_works_val),
                "eu_project_participation": pct_proj[oa_id],
                "network_centrality": pct_deg[oa_id],
                "country_diversity": 1.0 if country in config.FOCUS_COUNTRIES else 0.5,
                "recent_activity": (recent / wc) if wc else 0.0,
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

        # 7. Collaboration edges (per-topic)
        print("Step 7/8  Writing edges…")
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

        # 8. Embeddings + AI brief (own session)
        print("Step 8/8  Embeddings + AI brief…")
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
