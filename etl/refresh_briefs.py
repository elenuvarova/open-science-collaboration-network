"""Regenerate only the AI briefs, using data already in the DB.

Embeddings are reused (embed_topic only encodes works it hasn't seen), so this
takes a minute or two instead of a full ETL run. The scheduler runs it on boot
when the newest brief is more than a week old — e.g. after a Groq model was
retired and the weekly runs kept the old briefs.

    python etl/refresh_briefs.py
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

import config  # noqa: E402
from _db import SessionLocal  # noqa: E402
from embed import embed_topic  # noqa: E402


def main() -> int:
    failures = 0
    for topic in config.TOPICS:
        name = topic["name"]
        print(f"refresh_briefs: {name}")
        db = SessionLocal()
        try:
            if not embed_topic(db, name):
                failures += 1  # no brief written: report it, so the run isn't logged as ok
            db.commit()
        except Exception as e:  # noqa: BLE001
            db.rollback()
            failures += 1
            print(f"refresh_briefs: {name} failed: {e}")
        finally:
            db.close()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
