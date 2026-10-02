"""Delivery-record ingest: what the EU projects behind each institution have published.

Downloads CORDIS's per-project deliverables and publications files (CC BY 4.0, no
auth), counts them per project and upserts one project_output row for every
project already in the DB. No OpenAlex, no entity matching: the join key is the
CORDIS projectID == project.cordis_id (a digit string such as "101069359").

Counts belong to the PROJECT, not to any single partner. CORDIS lists no
open-access flag for publications, so there is no OA count.

Standalone and idempotent (re-running rewrites the same numbers):
  python etl/outputs.py

Also called as the last, non-fatal step of the weekly ETL (run.py) and once on
boot by backend/scheduler.py when project_output is empty. Streams every file
(csv module, one row at a time) so the 69 MB H2020 publications zip, 213 MB
unpacked, never sits in memory.
"""
import csv
import io
import os
import re
import sys
import time
import zipfile
from collections import defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

import requests  # noqa: E402

import config  # noqa: E402
import load  # noqa: E402
from _db import Base, SessionLocal, engine, models  # noqa: E402

# A fresh zip is reused for this long (retries, the boot job followed by an ETL),
# so a weekly run always re-downloads. CORDIS_CACHE_DIR lets a dev point at a scratch dir.
CACHE_DIR = os.environ.get("CORDIS_CACHE_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")
CACHE_MAX_AGE_S = 72 * 3600
MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024   # cap a runaway upstream, as sources/cordis.py does
MAX_MEMBER_BYTES = 1024 * 1024 * 1024    # zip-bomb guard on the unpacked CSV

COLS = ("deliverables", "demonstrators", "datasets", "reports", "other", "publications")

# Free text in these CSVs sometimes holds a raw ";", which shifts the columns of that
# row to the right. Rows with an unusable projectID are dropped, not guessed.
_DIGITS = re.compile(r"\d+")

csv.field_size_limit(10 * 1024 * 1024)  # long descriptions exceed the 128 KB default


def _norm_id(value) -> str:
    """CORDIS project id as the join key: trimmed, and no float artefact ("123.0")."""
    s = str(value or "").strip()
    return s[:-2] if s.endswith(".0") else s


def _bucket(deliverable_type: str) -> str:
    """CORDIS's own deliverableType label -> output bucket (prefix match: the data
    set label carries a trailing ", etc"). Data Management Plans, websites/patents/
    videos, ethics, "Open Research Data Pilot" and unlabelled rows all go to other."""
    t = (deliverable_type or "").strip().lower()
    if t.startswith("demonstrators"):
        return "demonstrators"
    if t.startswith("data sets"):
        return "datasets"
    if t.startswith("documents, reports"):
        return "reports"
    return "other"


# ── download ──────────────────────────────────────────────────────────────────

def _fetch_zip(url: str, label: str) -> str:
    """Download to a local file (never into memory) and return its path."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, f"cordis_outputs_{label}.zip")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < CACHE_MAX_AGE_S:
        print(f"  outputs: using cached {label}")
        return path
    tmp = path + ".part"
    last_err = None
    for attempt in (1, 2):
        try:
            print(f"  outputs: downloading {label} ({url})…")
            total = 0
            with requests.get(url, timeout=(15, 120), stream=True) as r:
                r.raise_for_status()
                with open(tmp, "wb") as out:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        total += len(chunk)
                        if total > MAX_DOWNLOAD_BYTES:
                            raise ValueError(f"{label} exceeded the {MAX_DOWNLOAD_BYTES // (1024 * 1024)} MB download cap")
                        out.write(chunk)
            if not zipfile.is_zipfile(tmp):  # a truncated download has no central directory
                raise ValueError(f"{label} is not a complete zip file")
            os.replace(tmp, path)
            print(f"  outputs: {label} {total / 1e6:.1f} MB")
            return path
        except Exception as e:  # noqa: BLE001
            last_err = e
            if os.path.exists(tmp):
                os.remove(tmp)
            if attempt == 1:
                print(f"  outputs: {label} download failed ({e}); retrying once")
                time.sleep(3)
    raise RuntimeError(f"could not download {label}: {last_err}")


# ── parse + aggregate ─────────────────────────────────────────────────────────

def _stream_rows(zip_path: str, filename: str):
    """Yield (project_id, header, record) per row of `filename` inside the zip, one
    row at a time. projectID is read from the END of the record: the columns after
    it are fixed, while an unescaped ";" in the description/title in front of it
    adds fields. A row whose projectID is not a plain number yields project_id None
    (the caller counts and skips it)."""
    with zipfile.ZipFile(zip_path) as z:
        member = next((n for n in z.namelist() if n.endswith(filename)), None)
        if member is None:
            raise FileNotFoundError(f"{filename} not in {os.path.basename(zip_path)}: {z.namelist()[:10]}")
        if z.getinfo(member).file_size > MAX_MEMBER_BYTES:
            raise ValueError(f"{member} unpacks beyond the {MAX_MEMBER_BYTES // (1024 * 1024)} MB cap")
        with z.open(member) as raw:
            reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""), delimiter=";")
            header = [h.strip() for h in next(reader)]
            if "projectID" not in header:
                raise ValueError(f"{filename}: no projectID column in {header}")
            from_end = header.index("projectID") - len(header)
            for rec in reader:
                pid = _norm_id(rec[from_end]) if len(rec) >= -from_end else ""
                yield (pid if _DIGITS.fullmatch(pid) else None), header, rec


def aggregate_programme(deliverables_zip: str, publications_zip: str, wanted: set | None = None):
    """Count outputs per project for one programme.

    wanted: normalised project ids to keep (None = all). Returns
    ({project_id: {col: n}}, stats) where stats counts rows read / skipped."""
    counts: dict[str, dict[str, int]] = defaultdict(lambda: dict.fromkeys(COLS, 0))
    stats = {"deliverable_rows": 0, "publication_rows": 0, "skipped_rows": 0}

    type_idx = None
    for pid, header, rec in _stream_rows(deliverables_zip, "projectDeliverables.csv"):
        stats["deliverable_rows"] += 1
        if pid is None:
            stats["skipped_rows"] += 1
            continue
        if wanted is not None and pid not in wanted:
            continue
        if type_idx is None:
            type_idx = header.index("deliverableType")
        c = counts[pid]
        c["deliverables"] += 1
        c[_bucket(rec[type_idx])] += 1

    for pid, _header, _rec in _stream_rows(publications_zip, "projectPublications.csv"):
        stats["publication_rows"] += 1
        if pid is None:
            stats["skipped_rows"] += 1
            continue
        if wanted is not None and pid not in wanted:
            continue
        counts[pid]["publications"] += 1

    return counts, stats


# ── run ───────────────────────────────────────────────────────────────────────

def run() -> int:
    """Refresh project_output. Returns the number of rows written; raises if any
    programme could not be downloaded or parsed (the others are still written, and
    a failed programme keeps its previous rows rather than being zeroed)."""
    Base.metadata.create_all(bind=engine)  # the API creates it on boot too; this makes a standalone run safe

    # Short sessions on purpose: no DB connection is held open across the downloads.
    with SessionLocal() as db:
        id_map = {_norm_id(cid): pid for pid, cid in db.query(models.Project.id, models.Project.cordis_id).all() if cid}
    if not id_map:
        print("outputs: no projects in the DB yet; nothing to do")
        return 0
    wanted = set(id_map)

    written, failures = 0, []
    for programme, urls in config.CORDIS_OUTPUT_DATASETS.items():
        t0 = time.monotonic()
        try:
            deliverables_zip = _fetch_zip(urls["deliverables"], f"{programme}_deliverables")
            publications_zip = _fetch_zip(urls["publications"], f"{programme}_publications")
            counts, stats = aggregate_programme(deliverables_zip, publications_zip, wanted)
        except Exception as e:  # noqa: BLE001
            print(f"  outputs: WARN {programme} failed: {e}")
            failures.append(f"{programme}: {e}")
            continue
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        rows = [{"project_id": id_map[cid], **c, "updated_at": now} for cid, c in sorted(counts.items())]
        with SessionLocal() as db:
            load.bulk_upsert_project_outputs(db, rows)
            db.commit()
        written += len(rows)
        print(f"  outputs: {programme} — {len(rows)} of our projects have outputs "
              f"({stats['deliverable_rows']} deliverable rows, {stats['publication_rows']} publication rows, "
              f"{stats['skipped_rows']} unreadable) in {time.monotonic() - t0:.0f}s")

    print(f"outputs: wrote {written} project_output rows for {len(id_map)} projects")
    if failures:
        raise RuntimeError("; ".join(failures))
    return written


def main() -> int:
    try:
        run()
    except Exception as e:  # noqa: BLE001
        print(f"outputs: FAILED: {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
