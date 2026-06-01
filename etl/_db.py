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
    _ensure_work_composite_key()


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


def _ensure_work_composite_key():
    """work.openalex_id used to be globally unique, so a work relevant to several
    topics collapsed to whichever topic ran last (earlier topics lost works).
    Switch to a composite unique (openalex_id, topic_id) — each topic keeps its
    own copy. Postgres: swap the constraint in place (rows preserved). SQLite:
    the single-column UNIQUE is baked into the table, so rebuild the disposable
    local tables (the ETL regenerates them)."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "work" not in insp.get_table_names():
        return
    uniques = insp.get_unique_constraints("work")
    indexes = insp.get_indexes("work")
    has_composite = (
        any(set(u["column_names"]) == {"openalex_id", "topic_id"} for u in uniques)
        or any(ix.get("unique") and set(ix["column_names"] or []) == {"openalex_id", "topic_id"} for ix in indexes)
    )
    if has_composite:
        return

    if db_kind == "postgres":
        with engine.begin() as conn:
            for u in uniques:
                if u["column_names"] == ["openalex_id"]:
                    conn.execute(text(f'ALTER TABLE work DROP CONSTRAINT IF EXISTS "{u["name"]}"'))
            for ix in indexes:
                if ix.get("unique") and ix["column_names"] == ["openalex_id"]:
                    conn.execute(text(f'DROP INDEX IF EXISTS "{ix["name"]}"'))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS work_openalex_topic_key "
                "ON work (openalex_id, topic_id)"
            ))
    else:
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS work_embedding"))
            conn.execute(text("DROP TABLE IF EXISTS work"))
        Base.metadata.create_all(bind=engine)
