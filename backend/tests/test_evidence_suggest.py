"""Smoke tests for GET /api/institutions/{id}/evidence and GET /api/suggest.

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
from models import (
    CollaborationEdge,
    Institution,
    InstitutionMetric,
    Project,
    ProjectParticipant,
    Topic,
)
from ratelimit import limiter
from routers import evidence, suggest


@pytest.fixture(scope="module")
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    _seed(Session)

    def _get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(evidence.router)
    app.include_router(suggest.router)
    app.dependency_overrides[get_db] = _get_db
    return TestClient(app)


def _seed(Session):
    db = Session()
    # Evidence counts only projects matching the topic's keyword stems; every
    # seeded title contains "project", so all of them are on topic 1.
    db.add(Topic(id=1, name="t1", keywords=["project"]))
    db.add(Topic(id=2, name="t2"))
    # 1 = focus uni, 2 = uni, 3 = company, 4 = ngo, 5 = isolated uni
    for i, (name, typ) in enumerate(
        [("Alpha U", "education"), ("Beta U", "education"), ("Gamma Ltd", "company"),
         ("Delta NGO", "nonprofit"), ("Epsilon U", "education")], start=1):
        db.add(Institution(id=i, name=name, country="BE", type=typ, openalex_id=f"I{i}"))
    for iid, fit, eu in [(2, 40.0, 3), (3, 80.0, 14), (4, 60.0, 0), (5, 90.0, 9)]:
        db.add(InstitutionMetric(institution_id=iid, topic_id=1, partner_fit_score=fit, eu_projects=eu))
    # edges (topic 1): 1-2 coauthor 3, 1-2 project 2 (same pair, two types), 3-1 project 1 (reverse dir),
    # 3-2 coauthor 1, 4-2 coauthor 5; topic 2 noise: 1-5
    for s, t, typ, w, topic in [
        (1, 2, "coauthor", 3, 1), (1, 2, "project", 2, 1), (3, 1, "project", 1, 1),
        (3, 2, "coauthor", 1, 1), (4, 2, "coauthor", 2, 1), (1, 5, "coauthor", 9, 2),
    ]:
        db.add(CollaborationEdge(source_institution_id=s, target_institution_id=t,
                                 type=typ, weight=w, topic_id=topic))
    # 12 projects for institution 1 (1 coordinator, rest participant), plus a duplicate row
    for p in range(1, 13):
        db.add(Project(id=p, cordis_id=f"C{p}", title=f"Project {p}", programme="HORIZON",
                       start_date=dt.date(2010 + p, 1, 1), end_date=dt.date(2012 + p, 1, 1),
                       ec_contribution=1000.0 * p))
        db.add(ProjectParticipant(project_id=p, institution_id=1,
                                  role="coordinator" if p == 12 else "participant"))
    db.add(ProjectParticipant(project_id=12, institution_id=1, role="participant"))  # duplicate row
    db.add(ProjectParticipant(project_id=1, institution_id=2, role="participant"))
    db.commit()
    db.close()


def test_evidence_projects_totals_partners(client):
    r = client.get("/api/institutions/1/evidence?topic=1")
    assert r.status_code == 200
    body = r.json()
    assert len(body["projects"]) == 10
    assert body["projects"][0]["title"] == "Project 12"  # newest first
    assert body["projects"][0]["role"] == "coordinator"  # dedupes to the coordinator row
    assert body["projects"][1]["role"] == "participant"
    assert body["totals"] == {"projects": 12, "coordinator": 1, "ec_contribution": 78000.0}
    partners = body["co_partners"]
    assert [p["id"] for p in partners] == [2, 3]
    assert partners[0]["weight"] == 5.0 and partners[0]["edge_types"] == ["coauthor", "project"]
    assert partners[1]["edge_types"] == ["project"]  # reverse-direction edge counted
    assert "recent_works" not in body  # no works<->institution link exists


def test_evidence_topic_filter_and_empty(client):
    ids = [p["id"] for p in client.get("/api/institutions/1/evidence?topic=2").json()["co_partners"]]
    assert ids == [5]
    empty = client.get("/api/institutions/5/evidence?topic=1").json()
    assert empty["projects"] == [] and empty["co_partners"] == []
    assert empty["totals"]["projects"] == 0


def test_evidence_404(client):
    assert client.get("/api/institutions/999/evidence").status_code == 404


def test_suggest_ranks_and_excludes_consortium(client):
    r = client.get("/api/suggest?topic=1&ids=1,2")
    assert r.status_code == 200
    out = r.json()
    ids = [s["id"] for s in out]
    assert 1 not in ids and 2 not in ids
    assert 5 not in ids  # only linked in topic 2
    assert set(ids) == {3, 4}
    top = out[0]
    assert top["id"] == 3  # linked to both partners + higher fit beats a single stronger link
    assert top["linked_partners"] == 2
    assert top["why"] == "co-authored and in EU projects with 2 of your partners · EU projects 14"


def test_suggest_why_without_eu_projects(client):
    out = client.get("/api/suggest?topic=1&ids=2").json()
    ngo = next(s for s in out if s["id"] == 4)
    assert ngo["why"] == "co-authored with 1 of your partners"  # no EU-projects suffix when 0


def test_suggest_role_filter(client):
    out = client.get("/api/suggest?topic=1&ids=1,2&role=technical").json()
    assert [s["id"] for s in out] == [3]
    assert client.get("/api/suggest?topic=1&ids=1,2&role=policy").json() == []
    assert client.get("/api/suggest?topic=1&ids=1,2&role=bogus").status_code == 422


def test_suggest_validation(client):
    assert client.get("/api/suggest?topic=1&ids=").status_code == 422
    assert client.get("/api/suggest?topic=1&ids=a,b").status_code == 422
    assert client.get("/api/suggest?topic=1").status_code == 422
    assert client.get("/api/suggest?topic=1&ids=5").json() == []  # no in-topic ties


def test_evidence_topic_excludes_off_topic_projects(client):
    # Topic 2 has no keywords, so it falls back to its name ("t2"): no seeded
    # project title matches, and the topic-scoped evidence lists none of them.
    r = client.get("/api/institutions/1/evidence?topic=2").json()
    assert r["projects"] == []
    assert r["totals"]["projects"] == 0
