"""Tests for GET /api/consortium/ties.

Runs against an in-memory SQLite database seeded per test module; no network,
no ETL. Run from backend/:  python -m pytest tests
"""
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
from models import CollaborationEdge, Institution, InstitutionMetric, Topic
from ratelimit import limiter
from routers import consortium


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
    app.include_router(consortium.router)
    app.dependency_overrides[get_db] = _get_db
    return TestClient(app)


def _seed(Session):
    db = Session()
    db.add(Topic(id=1, name="t1"))
    db.add(Topic(id=2, name="t2"))
    # Consortium for topic 1 = {1, 2, 3, 4}; 5..9 are outsiders.
    #   1-2: tied (coauthor 3 + project 1, two edge rows, one stored reversed)
    #   3:   weakly tied (single coauthor link of weight 1, to 2)
    #   4:   isolated
    for i in range(1, 10):
        db.add(Institution(id=i, name=f"Inst {i}", country="BE", type="education", openalex_id=f"I{i}"))
    for iid, fit, eu in [(5, 70.0, 4), (6, 90.0, 9), (7, 50.0, 1), (8, 60.0, 2)]:
        db.add(InstitutionMetric(institution_id=iid, topic_id=1, partner_fit_score=fit, eu_projects=eu))

    def edge(s, t, typ, w, topic=1):
        db.add(CollaborationEdge(source_institution_id=s, target_institution_id=t,
                                 type=typ, weight=w, topic_id=topic))

    edge(1, 2, "coauthor", 3)
    edge(2, 1, "project", 1)           # reverse direction, same pair, other type
    edge(3, 2, "coauthor", 1)          # 3 is weakly tied
    edge(1, 4, "coauthor", 9, topic=2)  # other topic: must not give 4 a tie in topic 1
    # Bridge candidates (topic 1)
    edge(5, 4, "project", 2)           # 5 -> isolated 4 and weak 3: reaches two needy members
    edge(5, 3, "coauthor", 1)
    edge(6, 4, "coauthor", 5)          # 6 -> only one member: not a bridge
    edge(7, 1, "coauthor", 4)          # 7 -> strong 1 and strong 2: nobody needs it
    edge(7, 2, "coauthor", 4)
    edge(4, 8, "coauthor", 1)          # 8 -> isolated 4 and strong 1: still bridges 4 into the group
    edge(8, 1, "project", 1)
    edge(9, 4, "coauthor", 3, topic=2)  # 9 only links in topic 2
    edge(9, 3, "coauthor", 3, topic=2)

    # Topic 2 scenario for the 5-bridge cap: members 1 and 2 have no tie; seven
    # outsiders (11..17) each link to both, with rising weight.
    for i in range(11, 18):
        db.add(Institution(id=i, name=f"Out {i}", country="NL", type="company", openalex_id=f"O{i}"))
        edge(i, 1, "coauthor", i - 10, topic=2)
        edge(i, 2, "project", 1, topic=2)
    db.commit()
    db.close()


def test_pairs_split_by_type_and_sum_both_directions(client):
    r = client.get("/api/consortium/ties?topic=1&ids=1,2,3,4")
    assert r.status_code == 200
    body = r.json()
    assert body["topic_id"] == 1
    assert [m["id"] for m in body["members"]] == [1, 2, 3, 4]
    assert body["pairs"] == [
        {"a": 1, "b": 2, "coauthor": 3.0, "project": 1.0, "weight": 4.0},
        {"a": 2, "b": 3, "coauthor": 1.0, "project": 0.0, "weight": 1.0},
    ]


def test_isolated_and_weak(client):
    body = client.get("/api/consortium/ties?topic=1&ids=1,2,3,4").json()
    assert body["isolated"] == [4]  # its only strong edge is in topic 2
    assert body["weak"] == [3]


def test_bridges_connect_isolated_or_weak_members(client):
    body = client.get("/api/consortium/ties?topic=1&ids=1,2,3,4").json()
    ids = [b["id"] for b in body["bridges"]]
    # 5 reaches two needy members; 8 reaches one needy + one strong member.
    assert ids == [5, 8]
    assert 6 not in ids  # single member only
    assert 7 not in ids  # links only well-tied members
    assert 9 not in ids  # edges are in another topic
    top = body["bridges"][0]
    assert top["partner_fit_score"] == 70.0 and top["eu_projects"] == 4
    assert top["connects"] == [{"member_id": 4, "weight": 2.0}, {"member_id": 3, "weight": 1.0}]
    assert all(b["id"] not in (1, 2, 3, 4) for b in body["bridges"])


def test_bridges_capped_at_five_and_ranked(client):
    body = client.get("/api/consortium/ties?topic=2&ids=1,2").json()
    assert body["pairs"] == [] and body["isolated"] == [1, 2]
    ids = [b["id"] for b in body["bridges"]]
    assert len(ids) == 5
    assert ids == [17, 16, 15, 14, 13]  # equal reach, strongest tie weight first


def test_unknown_ids_dropped_and_single_member(client):
    body = client.get("/api/consortium/ties?topic=1&ids=1,999").json()
    assert [m["id"] for m in body["members"]] == [1]
    assert body["pairs"] == [] and body["isolated"] == [] and body["bridges"] == []
    none = client.get("/api/consortium/ties?topic=1&ids=998,999").json()
    assert none["members"] == [] and none["pairs"] == []


def test_ties_scoped_to_topic(client):
    body = client.get("/api/consortium/ties?topic=2&ids=1,4").json()
    assert body["pairs"] == [{"a": 1, "b": 4, "coauthor": 9.0, "project": 0.0, "weight": 9.0}]
    assert body["isolated"] == []


def test_validation(client):
    assert client.get("/api/consortium/ties?topic=1&ids=").status_code == 422
    assert client.get("/api/consortium/ties?topic=1&ids=a,b").status_code == 422
    assert client.get("/api/consortium/ties?topic=1").status_code == 422
    assert client.get("/api/consortium/ties?ids=1,2").status_code == 422
    twenty = ",".join(str(i) for i in range(1, 21))
    assert client.get(f"/api/consortium/ties?topic=1&ids={twenty}").status_code == 200
    twenty_one = ",".join(str(i) for i in range(1, 22))
    assert client.get(f"/api/consortium/ties?topic=1&ids={twenty_one}").status_code == 422


def test_unknown_topic_404(client):
    assert client.get("/api/consortium/ties?topic=99&ids=1,2").status_code == 404
