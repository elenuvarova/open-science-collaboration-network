"""In-process ETL scheduler.

Replaces the old GitHub Actions cron (`.github/workflows/etl.yml`) that ran the
ETL weekly against a managed cloud database. Now the ETL ships INSIDE the prod
image and runs in a background thread of the FastAPI process, writing to the
container's own Postgres (the DATABASE_URL Coolify injects).

Design constraints:
  * Never block FastAPI startup or the event loop. The web app must bind the
    port and answer /api/health immediately, so all work happens in a daemon
    thread started from the FastAPI startup hook.
  * The ETL is heavy and calls sys.exit on fatal errors, so it runs as a
    SUBPROCESS (`python etl/run.py` from /app) — fully isolated from the web
    process. Its stdout/stderr is streamed into our logs.
  * Guard against overlapping runs (a long initial populate must not collide
    with the first weekly tick) via a non-blocking lock.
  * The delivery record (etl/outputs.py, CORDIS outputs per project) is the last
    step of every ETL run. On a deploy onto an already-seeded DB it is run once
    on its own when project_output is empty, so no full ETL run is needed.

Activation: set ENABLE_SCHEDULER=1. Unset → this module does nothing, so local
dev (and `import`) is side-effect free.
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("etl.scheduler")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

# Weekly cadence matching the old cron "0 4 * * 1" (Mondays 04:00 UTC).
SCHEDULE_WEEKDAY = 0  # Monday (Python: Monday=0)
SCHEDULE_HOUR_UTC = 4
SCHEDULE_MINUTE_UTC = 0

# Resolve paths off this file so they're correct no matter the cwd.
#   backend/scheduler.py → app root is the parent of backend/.
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_APP_ROOT = os.path.dirname(_BACKEND_DIR)
_ETL_ENTRY = os.path.join(_APP_ROOT, "etl", "run.py")
_OUTPUTS_ENTRY = os.path.join(_APP_ROOT, "etl", "outputs.py")

# Only one ETL run at a time. Non-blocking: a tick that arrives mid-run is
# skipped rather than queued.
_run_lock = threading.Lock()


def _db_is_unseeded() -> bool:
    """True when the DB has no ETL output yet (fresh container → needs populate).

    We probe institution_metric — the final table the ETL writes per topic — so
    a half-created schema (tables exist, no data) still counts as unseeded.
    Any error (table missing, DB unreachable) is treated as 'unseeded' so a
    transient hiccup never silently skips the initial populate; a failed ETL
    run will just be retried at the next tick.
    """
    try:
        from sqlalchemy import func, select

        from db import SessionLocal
        from models import InstitutionMetric

        with SessionLocal() as db:
            count = db.execute(
                select(func.count()).select_from(InstitutionMetric)
            ).scalar_one()
        logger.info("scheduler: institution_metric rows = %s", count)
        return (count or 0) == 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("scheduler: could not check DB seed state (%s); treating as unseeded", exc)
        return True


def _outputs_missing() -> bool:
    """True when project_output has no rows (the delivery record was never ingested).

    Unlike the seed check, an error here means 'don't run': a DB hiccup must not
    trigger a ~100 MB CORDIS download. The table is created by main.py on import,
    so a healthy DB always answers."""
    try:
        from sqlalchemy import func, select

        from db import SessionLocal
        from models import ProjectOutput

        with SessionLocal() as db:
            count = db.execute(select(func.count()).select_from(ProjectOutput)).scalar_one()
        logger.info("scheduler: project_output rows = %s", count)
        return (count or 0) == 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("scheduler: could not check project_output (%s); skipping the outputs populate", exc)
        return False


def _log_run(reason: str, started: str, finished: str | None, ok: bool, code: int | None) -> None:
    """Best-effort ETL run log (etl_run table); never let logging break the scheduler."""
    try:
        from db import SessionLocal
        from models import EtlRun
        with SessionLocal() as db:
            db.add(EtlRun(reason=reason, started_at=started, finished_at=finished, ok=ok, exit_code=code))
            db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("scheduler: could not record ETL run: %s", exc)


def _run_etl(reason: str, entry: str = _ETL_ENTRY, label: str = "ETL", record: bool = True) -> None:
    """Run the ETL (or another etl/ script) as an isolated subprocess; stream its
    output to our logs.

    Overlap guard: if a run is already in progress we skip this one. `record`
    writes an etl_run row, which the UI reads as "data refreshed on"; the
    outputs-only job passes False so it never moves that date.
    """
    if not _run_lock.acquire(blocking=False):
        logger.warning("scheduler: %s already running; skipping this %s trigger", label, reason)
        return
    try:
        logger.info("scheduler: starting %s (%s) → %s", label, reason, entry)
        start = time.monotonic()
        started_iso = datetime.now(timezone.utc).isoformat()
        # cwd=_APP_ROOT so `python etl/run.py` puts /app/etl on sys.path[0]
        # (run.py uses bare imports: config, load, graph, …) and its
        # ../backend resolution lands on /app/backend. DATABASE_URL /
        # OPENALEX_API_KEY / GROQ_API_KEY are inherited from the process env.
        proc = subprocess.Popen(
            [sys.executable, entry],
            cwd=_APP_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=os.environ.copy(),
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            logger.info("etl: %s", line.rstrip())
        rc = proc.wait()
        dur = time.monotonic() - start
        if record:
            _log_run(reason, started_iso, datetime.now(timezone.utc).isoformat(), rc == 0, rc)
        if rc == 0:
            logger.info("scheduler: %s finished OK in %.0fs (%s)", label, dur, reason)
        else:
            logger.error("scheduler: %s exited with code %s after %.0fs (%s)", label, rc, dur, reason)
    except Exception as exc:  # noqa: BLE001
        logger.exception("scheduler: %s failed to launch (%s): %s", label, reason, exc)
    finally:
        _run_lock.release()


def _seconds_until_next_run(now: datetime) -> float:
    """Seconds from `now` (UTC) until the next Monday 04:00 UTC."""
    target = now.replace(
        hour=SCHEDULE_HOUR_UTC, minute=SCHEDULE_MINUTE_UTC, second=0, microsecond=0
    )
    # Days ahead to the next scheduled weekday.
    days_ahead = (SCHEDULE_WEEKDAY - now.weekday()) % 7
    target += timedelta(days=days_ahead)
    if target <= now:
        target += timedelta(days=7)
    return (target - now).total_seconds()


def _scheduler_loop() -> None:
    # (a) Initial populate if the DB looks empty/unseeded.
    if _db_is_unseeded():
        logger.info("scheduler: DB unseeded → running initial populate")
        _run_etl("initial-populate")
    else:
        logger.info("scheduler: DB already seeded → skipping initial populate")
        # Seeded before the delivery record existed: fetch just that, once, here in
        # the scheduler thread (the web app is never blocked). A full ETL run also
        # ends with this step, so it is only needed when no ETL runs first.
        if _outputs_missing() and os.path.exists(_OUTPUTS_ENTRY):
            logger.info("scheduler: project_output empty → running the outputs populate")
            _run_etl("initial-outputs", entry=_OUTPUTS_ENTRY, label="outputs job", record=False)

    # (b) Weekly cadence forever after.
    while True:
        delay = _seconds_until_next_run(datetime.now(timezone.utc))
        logger.info("scheduler: next weekly ETL in %.1f h", delay / 3600)
        # Sleep in chunks so the daemon thread stays responsive to interpreter
        # shutdown rather than blocking on one multi-day sleep.
        deadline = time.monotonic() + delay
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            time.sleep(min(remaining, 3600))
        _run_etl("weekly")


def start_scheduler() -> bool:
    """Start the background ETL scheduler iff ENABLE_SCHEDULER=1.

    Returns True if the thread was started, False otherwise. Safe to call once
    from FastAPI's startup hook; returns immediately (never blocks startup).
    """
    if os.environ.get("ENABLE_SCHEDULER") != "1":
        logger.info("scheduler: ENABLE_SCHEDULER != 1 → not starting")
        return False
    if not os.path.exists(_ETL_ENTRY):
        logger.error("scheduler: ETL entry not found at %s → not starting", _ETL_ENTRY)
        return False
    thread = threading.Thread(
        target=_scheduler_loop, name="etl-scheduler", daemon=True
    )
    thread.start()
    logger.info("scheduler: background ETL thread started")
    return True
