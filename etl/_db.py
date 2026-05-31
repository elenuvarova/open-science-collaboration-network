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
