import os
import sys
import tempfile

# Throw-away SQLite DB + no startup warm-up, set before `main` is imported.
os.environ["SQLITE_PATH"] = os.path.join(tempfile.mkdtemp(), "test.sqlite")
os.environ["CALLS_WARMUP"] = "0"
os.environ.pop("DATABASE_URL", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
