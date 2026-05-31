"""Write precomputed results into Postgres (Neon) / SQLite.

Functional upsert helpers used by both seed_sample.py (dev demo data) and the
real Phase-2 pipeline (run.py). Idempotent on natural keys.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from _db import SessionLocal, init_schema, models
from db import db_kind


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


def add_edge(db, source_id, target_id, type_, weight=1.0):
    db.add(
        models.CollaborationEdge(
            source_institution_id=source_id,
            target_institution_id=target_id,
            type=type_,
            weight=weight,
        )
    )


__all__ = [
    "SessionLocal",
    "init_schema",
    "get_or_create_topic",
    "upsert_institution",
    "upsert_project",
    "upsert_project_participant",
    "set_metric",
    "add_edge",
]
