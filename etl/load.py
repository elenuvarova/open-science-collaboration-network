"""Write precomputed results into Postgres (Neon) / SQLite.

Functional upsert helpers used by both seed_sample.py (dev demo data) and the
real Phase-2 pipeline (run.py). Idempotent on natural keys.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import insert

from _db import SessionLocal, init_schema, models
from db import db_kind


def _chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def _dialect_insert():
    """Dialect-specific INSERT that supports ON CONFLICT (Postgres in prod,
    SQLite locally — both expose on_conflict_do_update + RETURNING)."""
    if db_kind == "postgres":
        from sqlalchemy.dialects.postgresql import insert as ins
    else:
        from sqlalchemy.dialects.sqlite import insert as ins
    return ins


def get_or_create_topic(db, name, keywords=None):
    topic = db.query(models.Topic).filter_by(name=name).first()
    if topic is None:
        topic = models.Topic(name=name, keywords=keywords or [])
        db.add(topic)
        db.flush()
    return topic


def upsert_institution(db, **kwargs):
    """Race-safe upsert: uses ON CONFLICT DO UPDATE on Postgres."""
    if db_kind == "postgres":
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        stmt = (
            pg_insert(models.Institution)
            .values(**kwargs)
            .on_conflict_do_update(
                index_elements=["openalex_id"],
                set_={k: v for k, v in kwargs.items() if k != "openalex_id"},
            )
            .returning(models.Institution.id)
        )
        row = db.execute(stmt).fetchone()
        db.flush()
        return db.get(models.Institution, row[0])
    else:
        inst = db.query(models.Institution).filter_by(openalex_id=kwargs.get("openalex_id")).first()
        if inst is None:
            inst = models.Institution(**kwargs)
            db.add(inst)
            db.flush()
        else:
            for k, v in kwargs.items():
                setattr(inst, k, v)
        return inst


def set_metric(db, institution_id, topic_id, **kwargs):
    m = (
        db.query(models.InstitutionMetric)
        .filter_by(institution_id=institution_id, topic_id=topic_id)
        .first()
    )
    if m is None:
        m = models.InstitutionMetric(institution_id=institution_id, topic_id=topic_id, **kwargs)
        db.add(m)
    else:
        for k, v in kwargs.items():
            setattr(m, k, v)
    return m


def upsert_project(db, cordis_id, **kwargs):
    proj = db.query(models.Project).filter_by(cordis_id=cordis_id).first()
    if proj is None:
        proj = models.Project(cordis_id=cordis_id, **kwargs)
        db.add(proj)
        db.flush()
    else:
        for k, v in kwargs.items():
            setattr(proj, k, v)
    return proj


def upsert_project_participant(db, project_id, institution_id, role):
    pp = (
        db.query(models.ProjectParticipant)
        .filter_by(project_id=project_id, institution_id=institution_id)
        .first()
    )
    if pp is None:
        pp = models.ProjectParticipant(
            project_id=project_id, institution_id=institution_id, role=role
        )
        db.add(pp)
    return pp


def add_edge(db, source_id, target_id, topic_id, type_, weight=1.0):
    db.add(
        models.CollaborationEdge(
            source_institution_id=source_id,
            target_institution_id=target_id,
            topic_id=topic_id,
            type=type_,
            weight=weight,
        )
    )


# ── Bulk writers ──────────────────────────────────────────────────────────────
# The per-row upsert helpers above flush/SELECT once per row — fine for the tiny
# seed script, but against remote Neon that's thousands of round-trips (minutes)
# for one topic's ~3-4k institutions/metrics. The bulk writers below collapse
# each hot loop into a handful of statements.

_INST_COLS = ("name", "normalized_name", "country", "type", "ror_id")
_PROJ_COLS = ("title", "abstract", "programme", "countries")
_WORK_COLS = ("title", "year", "abstract", "doi", "cited_by_count", "topic_id")


def bulk_upsert_institutions(db, rows):
    """rows: dicts with openalex_id + _INST_COLS. Returns {openalex_id: id}.

    rows must be unique on openalex_id (ON CONFLICT can't touch a row twice in
    one statement) — the caller derives them from a dict keyed by openalex_id."""
    if not rows:
        return {}
    ins = _dialect_insert()
    id_map = {}
    for chunk in _chunks(rows, 500):
        stmt = ins(models.Institution).values(chunk)
        stmt = stmt.on_conflict_do_update(
            index_elements=["openalex_id"],
            set_={c: getattr(stmt.excluded, c) for c in _INST_COLS},
        ).returning(models.Institution.id, models.Institution.openalex_id)
        for iid, oa in db.execute(stmt).all():
            id_map[oa] = iid
    return id_map


def bulk_upsert_projects(db, rows):
    """rows: dicts with cordis_id + _PROJ_COLS. Returns {cordis_id: id}.
    rows must be unique on cordis_id."""
    if not rows:
        return {}
    ins = _dialect_insert()
    id_map = {}
    for chunk in _chunks(rows, 500):
        stmt = ins(models.Project).values(chunk)
        stmt = stmt.on_conflict_do_update(
            index_elements=["cordis_id"],
            set_={c: getattr(stmt.excluded, c) for c in _PROJ_COLS},
        ).returning(models.Project.id, models.Project.cordis_id)
        for pid, cid in db.execute(stmt).all():
            id_map[cid] = pid
    return id_map


def bulk_upsert_works(db, rows):
    """rows: dicts with openalex_id + _WORK_COLS. Returns {openalex_id: id}.
    rows must be unique on openalex_id. Stored so embeddings + semantic search
    have content (a work belongs to one topic via topic_id)."""
    if not rows:
        return {}
    ins = _dialect_insert()
    id_map = {}
    for chunk in _chunks(rows, 500):
        stmt = ins(models.Work).values(chunk)
        stmt = stmt.on_conflict_do_update(
            index_elements=["openalex_id"],
            set_={c: getattr(stmt.excluded, c) for c in _WORK_COLS},
        ).returning(models.Work.id, models.Work.openalex_id)
        for wid, oa in db.execute(stmt).all():
            id_map[oa] = wid
    return id_map


def insert_project_participants(db, rows):
    """Bulk-insert participant rows (project_id, institution_id, role), skipping
    (project_id, institution_id) pairs already present — preserves the old
    per-row upsert's no-duplicate, accumulate-across-topics behavior."""
    if not rows:
        return
    # De-dup within the batch first (the table has no unique constraint, so a
    # repeated pair would otherwise insert twice).
    seen: set[tuple[int, int]] = set()
    batch = []
    for r in rows:
        key = (r["project_id"], r["institution_id"])
        if key not in seen:
            seen.add(key)
            batch.append(r)
    pids = list({r["project_id"] for r in batch})
    existing = set()
    for chunk in _chunks(pids, 500):
        for pid, iid in db.query(
            models.ProjectParticipant.project_id,
            models.ProjectParticipant.institution_id,
        ).filter(models.ProjectParticipant.project_id.in_(chunk)).all():
            existing.add((pid, iid))
    fresh = [r for r in batch if (r["project_id"], r["institution_id"]) not in existing]
    if fresh:
        db.execute(insert(models.ProjectParticipant), fresh)


def replace_topic_metrics(db, topic_id, rows):
    """Metrics are topic-scoped: clear this topic's metrics, then bulk insert."""
    db.query(models.InstitutionMetric).filter_by(topic_id=topic_id).delete(
        synchronize_session=False
    )
    if rows:
        db.execute(insert(models.InstitutionMetric), rows)


__all__ = [
    "SessionLocal",
    "init_schema",
    "get_or_create_topic",
    "upsert_institution",
    "upsert_project",
    "upsert_project_participant",
    "set_metric",
    "add_edge",
    "bulk_upsert_institutions",
    "bulk_upsert_projects",
    "bulk_upsert_works",
    "insert_project_participants",
    "replace_topic_metrics",
]
