"""Tiny idempotent startup migrations (there is no migration tool).

Base.metadata.create_all() creates missing tables but never adds columns to an
existing one, so columns added to a model later are added here, only when missing.
Works on SQLite and Postgres: FLOAT is a valid type in both (double precision on
Postgres), and ADD COLUMN ... DEFAULT <constant> fills existing rows with it.
"""
from sqlalchemy import inspect, text

EDGE_SPLIT_COLUMNS = ("coauthor_weight", "project_weight")


def _edge_columns(engine) -> set[str]:
    # Fresh inspector each time: column lists are cached per inspector.
    return {c["name"] for c in inspect(engine).get_columns("collaboration_edge")}


def ensure_edge_split_columns(engine) -> list[str]:
    """Add collaboration_edge.coauthor_weight / project_weight if missing.
    Returns the names added (empty when already up to date)."""
    added: list[str] = []
    if "collaboration_edge" not in inspect(engine).get_table_names():
        return added  # create_all builds it with the columns
    for col in EDGE_SPLIT_COLUMNS:
        if col in _edge_columns(engine):
            continue
        try:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE collaboration_edge ADD COLUMN {col} FLOAT DEFAULT 0"))
            added.append(col)
        except Exception:
            # The API and the ETL can start together: the other one may have won the race.
            if col not in _edge_columns(engine):
                raise
    return added
