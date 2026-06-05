# DATABASE_URL → Postgres (Coolify-internal); absent → SQLite (local). Same code, two environments.
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
    # pool_pre_ping: revive a connection that went stale while checked back in.
    # pool_recycle: drop connections older than 5 min on checkout. TCP keepalives
    # keep an in-use connection alive across short idle gaps (e.g. the embedding
    # encode) so it isn't reset by an idle timeout.
    engine = create_engine(
        f"postgresql+psycopg://{rest}",
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args={
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
        },
    )
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
