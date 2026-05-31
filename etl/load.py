"""Write precomputed results into Postgres (Neon) / SQLite.

Functional upsert helpers used by both seed_sample.py (dev demo data) and the
real Phase-2 pipeline (run.py). Idempotent on natural keys.
"""
from _db import SessionLocal, init_schema, models


def get_or_create_topic(db, name, keywords=None):
    topic = db.query(models.Topic).filter_by(name=name).first()
    if topic is None:
        topic = models.Topic(name=name, keywords=keywords or [])
        db.add(topic)
        db.flush()
    return topic


def upsert_institution(db, **kwargs):
    inst = None
    if kwargs.get("openalex_id"):
        inst = db.query(models.Institution).filter_by(openalex_id=kwargs["openalex_id"]).first()
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
    "set_metric",
    "add_edge",
]
