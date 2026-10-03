"""ROR outages vs "no match", and the participation sweep after a full run.
Run from the repo root:  python -m pytest etl/tests -q
"""
import os
import sys

ETL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ETL)
os.environ.setdefault("SQLITE_PATH", ":memory:")

import pytest
import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import match
from sources import ror


class _Resp:
    def __init__(self, code, body=None, headers=None):
        self.status_code, self._body, self.headers = code, body or {}, headers or {}

    def json(self):
        return self._body


@pytest.fixture(autouse=True)
def _fast(monkeypatch):
    monkeypatch.setattr(ror.time, "sleep", lambda *_: None)
    ror._cache.clear()


def test_ror_error_raises_and_is_not_cached(monkeypatch):
    calls = []
    monkeypatch.setattr(ror.requests, "get", lambda *a, **k: calls.append(1) or _Resp(503))
    with pytest.raises(ror.RorUnavailable):
        ror.match_to_ror("Ghent University", "BE")
    assert len(calls) == ror._RETRIES  # retried
    assert "Ghent University|BE" not in ror._cache  # an outage is not remembered as "no match"


def test_ror_429_then_success(monkeypatch):
    org = {"id": "https://ror.org/00cv9y106", "locations": [{"geonames_details": {"country_code": "BE"}}]}
    seq = [_Resp(429, headers={"Retry-After": "1"}), _Resp(200, {"items": [{"chosen": True, "organization": org}]})]
    monkeypatch.setattr(ror.requests, "get", lambda *a, **k: seq.pop(0))
    assert ror.match_to_ror("Ghent University", "BE") == "https://ror.org/00cv9y106"


def test_ror_timeout_counts_as_unavailable(monkeypatch):
    def boom(*a, **k):
        raise requests.ReadTimeout()
    monkeypatch.setattr(ror.requests, "get", boom)
    with pytest.raises(ror.RorUnavailable):
        ror.match_to_ror("X", "BE")


def test_best_match_marks_ror_outage_unverified(monkeypatch):
    def down(*a, **k):
        raise ror.RorUnavailable("HTTP 503")
    monkeypatch.setattr(match, "match_to_ror", down)
    inst = {"openalex_id": "I1", "name": "Universiteit Gent"}
    by_country = {"BE": [("universiteit gent hospital", inst)]}
    found, score, method = match.best_match("Universiteit Gent", "BE", {}, by_country)
    assert 75 <= score < 90, score  # in the band that asks ROR
    assert method == "fuzzy_unverified" and found is inst
    assert match.accept_match(method, score, accept_unconfirmed=False) is False
    assert match.accept_match(method, score, accept_unconfirmed=True) is True


@pytest.fixture
def db():
    import _db
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    _db.Base.metadata.create_all(bind=engine)
    s = sessionmaker(bind=engine)()
    yield s
    s.close()


def _pairs(db):
    import load
    PP = load.models.ProjectParticipant
    return {(r.project_id, r.institution_id, r.seen_run) for r in db.query(PP).all()}


def test_full_run_sweeps_participations_it_did_not_match(db):
    import load
    PP = load.models.ProjectParticipant
    # Rows from an older run under the loose rule: (1,10) is still matched, (1,11) is not.
    db.add_all([PP(project_id=1, institution_id=10, role="participant"),
                PP(project_id=1, institution_id=11, role="participant")])
    db.commit()
    tag = "2026-10-05T04:00:00+00:00"
    # Two topics in the same run, overlapping on project 1.
    load.insert_project_participants(db, [{"project_id": 1, "institution_id": 10, "role": "participant"},
                                          {"project_id": 2, "institution_id": 12, "role": "coordinator"}], tag)
    load.insert_project_participants(db, [{"project_id": 1, "institution_id": 10, "role": "participant"}], tag)
    db.commit()
    deleted, kept = load.sweep_unseen_participants(db, tag)
    db.commit()
    assert (deleted, kept) == (1, 2)
    assert _pairs(db) == {(1, 10, tag), (2, 12, tag)}


def test_sweep_refuses_when_run_matched_nothing(db):
    import load
    PP = load.models.ProjectParticipant
    db.add(PP(project_id=1, institution_id=10, role="participant"))
    db.commit()
    with pytest.raises(RuntimeError):
        load.sweep_unseen_participants(db, "2026-10-05T04:00:00+00:00")
    assert len(_pairs(db)) == 1


def test_untagged_insert_keeps_old_behaviour(db):
    import load
    load.insert_project_participants(db, [{"project_id": 1, "institution_id": 10, "role": "participant"}] * 2)
    db.commit()
    assert _pairs(db) == {(1, 10, None)}
