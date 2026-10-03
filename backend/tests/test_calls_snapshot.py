"""The last good calls fetch survives a restart and a blocked portal."""
import time

import pytest

import eu_calls
import main  # noqa: F401  (creates the tables)
from db import SessionLocal
from models import CallsSnapshot

CALL = {"identifier": "HORIZON-CL6-2027-01", "title": "Flood resilience", "deadlines": ["2027-02-01"]}


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    eu_calls.reset_cache()
    monkeypatch.setattr(eu_calls, "embed_calls", lambda calls: None)
    with SessionLocal() as db:
        db.query(CallsSnapshot).delete()
        db.commit()
    yield
    eu_calls.reset_cache()


def _blocked():
    raise RuntimeError("403 sorry.ec.europa.eu")


def test_fetch_saves_snapshot_without_vectors(monkeypatch):
    monkeypatch.setattr(eu_calls, "fetch_calls", lambda: [{**CALL, "vec": object()}])
    calls, stale, _ = eu_calls.get_calls()
    assert calls[0]["identifier"] == CALL["identifier"] and stale is False
    with SessionLocal() as db:
        snap = db.get(CallsSnapshot, 1)
        assert snap.payload == [CALL]


def test_restart_within_ttl_reads_snapshot_not_portal(monkeypatch):
    with SessionLocal() as db:
        db.add(CallsSnapshot(id=1, fetched_at=time.time() - 3600, payload=[CALL]))
        db.commit()
    hits = []
    monkeypatch.setattr(eu_calls, "fetch_calls", lambda: hits.append(1) or [])
    calls, stale, _ = eu_calls.get_calls()
    assert calls == [CALL] and stale is False and hits == []


def test_blocked_portal_after_restart_serves_old_snapshot_as_stale(monkeypatch):
    with SessionLocal() as db:
        db.add(CallsSnapshot(id=1, fetched_at=time.time() - 3 * 86400, payload=[CALL]))
        db.commit()
    monkeypatch.setattr(eu_calls, "fetch_calls", _blocked)
    calls, stale, fetched = eu_calls.get_calls()
    assert calls == [CALL] and stale is True and fetched is not None


def test_blocked_portal_without_snapshot_is_empty_not_an_error(monkeypatch):
    monkeypatch.setattr(eu_calls, "fetch_calls", _blocked)
    calls, stale, fetched = eu_calls.get_calls()
    assert calls == [] and stale is True and fetched is None
