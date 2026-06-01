"""Shared DB access for the ETL — reuses backend's SQLAlchemy engine + models so
the writer (ETL) and reader (API) never drift on schema."""
import os
import sys

# Make backend/ importable (engine, Base, models live there — single source of truth).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from db import Base, SessionLocal, db_kind, engine  # noqa: E402
import models  # noqa: E402,F401

__all__ = ["Base", "SessionLocal", "db_kind", "engine", "models"]


def init_schema():
    Base.metadata.create_all(bind=engine)
    _ensure_edge_topic_id()


def _ensure_edge_topic_id():
    """collaboration_edge predates per-topic scoping (its rows used to be a single
    global graph). Add topic_id idempotently and clear the pre-migration rows —
    they're topic-less and get regenerated per topic on the next ETL run."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "collaboration_edge" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("collaboration_edge")}
    if "topic_id" in cols:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE collaboration_edge ADD COLUMN topic_id INTEGER"))
        conn.execute(text("DELETE FROM collaboration_edge"))
