"""Tests for GET /api/institutions/{id}/delivery (the delivery record).

Runs against an in-memory SQLite database seeded per test module; no network,
no ETL. Run from backend/:  python -m pytest tests
"""
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("SQLITE_PATH", ":memory:")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db import Base, get_db
from models import Institution, Project, ProjectOutput, ProjectParticipant, Topic
from ratelimit import limiter
from routers import delivery

STAMP = "2026-10-02T10:00:00+00:00"


def _make_client(with_outputs: bool) -> TestClient:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    _seed(Session, with_outputs)

    def _get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(delivery.router)
    app.dependency_overrides[get_db] = _get_db
    return TestClient(app)


@pytest.fixture(scope="module")
def client():
    return _make_client(with_outputs=True)


@pytest.fixture(scope="module")
def empty_client():
    return _make_client(with_outputs=False)


def _seed(Session, with_outputs: bool):
    db = Session()
    db.add(Topic(id=1, name="t1", keywords=["project"]))
    db.add(Topic(id=2, name="t2", keywords=["zzz-no-match"]))
    for i in range(1, 5):
        db.add(Institution(id=i, name=f"Inst {i}", country="BE", type="education", openalex_id=f"I{i}"))
    # Projects 1-5 match topic 1 ("project" in the title); 6 is off topic.
    for p in range(1, 7):
        db.add(Project(id=p, cordis_id=f"C{p}", title="Quantum widgets" if p == 6 else f"Project {p}",
                       programme="HORIZON", start_date=dt.date(2022, 1, 1)))
    # Institution 1: projects 1-4 and 6, project 1 listed twice. Institution 2: project 5
    # only. Institution 3: project 1. Institution 4: none.
    for pid in (1, 2, 3, 4, 6):
        db.add(ProjectParticipant(project_id=pid, institution_id=1, role="participant"))
    db.add(ProjectParticipant(project_id=1, institution_id=1, role="coordinator"))  # duplicate row
    db.add(ProjectParticipant(project_id=5, institution_id=2, role="participant"))
    db.add(ProjectParticipant(project_id=1, institution_id=3, role="participant"))
    if with_outputs:
        for pid, d, demo, data, rep, oth, pub in [
            (1, 10, 2, 1, 5, 2, 4),    # demonstrators + a dataset
            (2, 3, 0, 0, 3, 0, 0),     # reports only
            (3, 0, 0, 0, 0, 0, 6),     # publications only
            (6, 12, 5, 5, 2, 0, 20),   # off topic 1
        ]:
            db.add(ProjectOutput(project_id=pid, deliverables=d, demonstrators=demo, datasets=data,
                                 reports=rep, other=oth, publications=pub, updated_at=STAMP))
        # project 4 and 5: CORDIS lists no outputs -> no row
    db.commit()
    db.close()


def test_delivery_topic_scoped_totals_and_shares(client):
    r = client.get("/api/institutions/1/delivery?topic=1")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["topic_id"] == 1
    assert body["projects_total"] == 4            # projects 1-4; the duplicate row and project 6 do not count
    assert body["projects_with_outputs"] == 3     # project 4 has no row
    assert body["totals"] == {"deliverables": 13, "demonstrators": 2, "datasets": 1,
                              "reports": 8, "other": 2, "publications": 10}
    assert body["projects_with_demonstrator_or_dataset"] == 1
    assert body["demonstrator_or_dataset_share"] == 0.25   # of ALL 4 projects
    assert body["publications_per_project"] == 2.5
    assert body["updated_at"] == STAMP
    assert "open_access" not in str(body)          # CORDIS has no OA flag; nothing is claimed


def test_delivery_without_topic_includes_every_project(client):
    body = client.get("/api/institutions/1/delivery").json()
    assert body["topic_id"] is None
    assert body["projects_total"] == 5
    assert body["projects_with_outputs"] == 4
    assert body["totals"]["demonstrators"] == 7 and body["totals"]["datasets"] == 6
    assert body["totals"]["publications"] == 30
    assert body["projects_with_demonstrator_or_dataset"] == 2
    assert body["demonstrator_or_dataset_share"] == 0.4
    assert body["publications_per_project"] == 6.0


def test_delivery_topic_with_no_matching_projects(client):
    body = client.get("/api/institutions/1/delivery?topic=2").json()
    assert body["projects_total"] == 0 and body["projects_with_outputs"] == 0
    assert body["demonstrator_or_dataset_share"] is None and body["publications_per_project"] is None
    assert body["available"] is True               # data exists, just none on this topic


def test_delivery_projects_without_output_rows(client):
    # Institution 2's only project has no row: data is loaded, this institution has none recorded.
    body = client.get("/api/institutions/2/delivery?topic=1").json()
    assert body["available"] is True
    assert body["projects_total"] == 1 and body["projects_with_outputs"] == 0
    assert body["totals"]["deliverables"] == 0 and body["totals"]["publications"] == 0
    assert body["demonstrator_or_dataset_share"] == 0.0
    assert body["publications_per_project"] == 0.0
    assert body["updated_at"] is None


def test_delivery_single_project_all_delivering(client):
    body = client.get("/api/institutions/3/delivery?topic=1").json()
    assert body["projects_total"] == 1
    assert body["demonstrator_or_dataset_share"] == 1.0
    assert body["publications_per_project"] == 4.0


def test_delivery_institution_without_projects(client):
    body = client.get("/api/institutions/4/delivery").json()
    assert body["projects_total"] == 0
    assert body["demonstrator_or_dataset_share"] is None and body["publications_per_project"] is None


def test_delivery_not_loaded_yet(empty_client):
    body = empty_client.get("/api/institutions/1/delivery?topic=1").json()
    assert body["available"] is False              # the UI shows "loading after the next refresh"
    assert body["projects_total"] == 4 and body["projects_with_outputs"] == 0


def test_delivery_404_and_validation(client):
    assert client.get("/api/institutions/999/delivery").status_code == 404
    assert client.get("/api/institutions/1/delivery?topic=abc").status_code == 422
