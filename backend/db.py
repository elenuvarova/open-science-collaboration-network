# DATABASE_URL → Postgres (Neon); absent → SQLite (local). Same code, two environments.
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

url = os.environ.get("DATABASE_URL", "")

if url.startswith("postgres://") or url.startswith("postgresql://"):
    # Normalize any postgres scheme to the psycopg (v3) driver SQLAlchemy uses.
    scheme, _, rest = url.partition("://")
    db_kind = "postgres"
    engine = create_engine(f"postgresql+psycopg://{rest}", pool_pre_ping=True)
else:
    db_kind = "sqlite"
    # Anchor the default file to backend/ so the API and the ETL (run from etl/)
    # share one local database regardless of the current working directory.
    default_sqlite = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.sqlite")
    sqlite_path = os.environ.get("SQLITE_PATH", default_sqlite)
    engine = create_engine(
        f"sqlite:///{sqlite_path}",
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
