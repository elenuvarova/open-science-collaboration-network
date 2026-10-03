"""Split collaboration weights (coauthor_weight / project_weight) and strict matching.

Edges are seeded the way the real ETL writes them: ONE edge per pair, type
"coauthor" with the project share folded into `weight` (works + 0.5 * projects),
plus the split columns. A legacy pair (split 0/0, weight > 0) must keep today's
"tie strength" behaviour. Run from backend/:  python -m pytest tests
"""
import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
sys.path.append(os.path.join(BACKEND, "..", "etl"))  # graph.py, match.py (ETL modules)
os.environ.setdefault("SQLITE_PATH", ":memory:")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db import Base, get_db
from migrate import ensure_edge_split_columns
from models import CollaborationEdge, Institution, InstitutionMetric, Project, ProjectParticipant, Topic
from ratelimit import limiter
from routers import consortium, evidence, suggest


@pytest.fixture(scope="module")
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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
    for r in (consortium.router, evidence.router, suggest.router):
        app.include_router(r)
    app.dependency_overrides[get_db] = _get_db
    return TestClient(app)


def _seed(Session):
    db = Session()
    db.add(Topic(id=1, name="t1", keywords=["project"]))
    for i in range(1, 8):
        db.add(Institution(id=i, name=f"Inst {i}", country="BE", type="education", openalex_id=f"I{i}"))
    for iid, fit, eu in [(5, 70.0, 4), (6, 50.0, 0), (7, 60.0, 2)]:
        db.add(InstitutionMetric(institution_id=iid, topic_id=1, partner_fit_score=fit, eu_projects=eu))

    def edge(s, t, typ, weight, works=0.0, projects=0.0):
        db.add(CollaborationEdge(source_institution_id=s, target_institution_id=t, topic_id=1, type=typ,
                                 weight=weight, coauthor_weight=works, project_weight=projects))

    # One edge per pair, as the ETL writes it.
    edge(1, 2, "coauthor", 4.0, works=3, projects=2)   # folded: 3 + 0.5 * 2
    edge(2, 3, "coauthor", 2.0, works=2, projects=0)   # works only
    edge(1, 3, "project", 2.0, works=0, projects=2)    # project-only edge: weight = projects
    edge(4, 1, "coauthor", 3.0)                        # LEGACY row: split 0/0, weight 3
    edge(5, 1, "coauthor", 4.0, works=3, projects=2)   # candidate 5 -> members 1 and 2
    edge(5, 2, "coauthor", 1.0, works=1, projects=0)
    edge(6, 1, "project", 2.0, works=0, projects=2)    # candidate 6: projects only
    edge(7, 1, "coauthor", 3.0)                        # candidate 7: legacy, unknown split
    # Participations behind the evidence panel. Topic stem "project": 101 and 102
    # are on topic (stem in the title); 103 is not, though the ETL's broad filter
    # put it on the 1-3 edge above (project_weight 2).
    for pid, title in [(101, "Climate project A"), (102, "Project B"), (103, "Unrelated work")]:
        db.add(Project(id=pid, cordis_id=f"C{pid}", title=title, abstract=""))
    for pid, iid in [(101, 1), (101, 2), (102, 1), (102, 2), (103, 1), (103, 3)]:
        db.add(ProjectParticipant(project_id=pid, institution_id=iid, role="participant"))
    db.commit()
    db.close()


def test_ties_known_split_gives_true_counts(client):
    body = client.get("/api/consortium/ties?topic=1&ids=1,2,3").json()
    pairs = {(p["a"], p["b"]): p for p in body["pairs"]}
    assert pairs[(1, 2)] == {"a": 1, "b": 2, "coauthor": 3.0, "project": 2.0, "weight": 4.0, "split_known": True}
    assert pairs[(2, 3)]["split_known"] and pairs[(2, 3)]["coauthor"] == 2.0 and pairs[(2, 3)]["project"] == 0.0
    assert pairs[(1, 3)]["split_known"] and pairs[(1, 3)]["coauthor"] == 0.0 and pairs[(1, 3)]["project"] == 2.0


def test_ties_legacy_split_falls_back_to_strength(client):
    body = client.get("/api/consortium/ties?topic=1&ids=1,4").json()
    assert body["pairs"] == [{"a": 1, "b": 4, "coauthor": 3.0, "project": 0.0, "weight": 3.0, "split_known": False}]
    assert body["isolated"] == []


def test_evidence_copartners_counts_and_legacy(client):
    partners = {p["id"]: p for p in client.get("/api/institutions/1/evidence?topic=1").json()["co_partners"]}
    # Folded coauthor edge lists both kinds, with counts.
    assert partners[2]["edge_types"] == ["coauthor", "project"]
    assert (partners[2]["coauthor_works"], partners[2]["shared_projects"]) == (3, 2)
    assert partners[2]["weight"] == 4.0
    assert partners[3]["edge_types"] == ["project"]
    # Shared projects use the strict on-topic match, like the totals: 103 is off topic.
    assert (partners[3]["coauthor_works"], partners[3]["shared_projects"]) == (0, 0)
    # Legacy: counts unknown (omitted), type as stored.
    assert partners[4]["edge_types"] == ["coauthor"]
    assert "coauthor_works" not in partners[4] and "shared_projects" not in partners[4]  # None fields are omitted


def test_evidence_shared_projects_never_exceed_strict_totals(client):
    body = client.get("/api/institutions/1/evidence?topic=1").json()
    assert body["totals"]["projects"] == 2  # 101, 102 (103 is off topic)
    assert all((p.get("shared_projects") or 0) <= body["totals"]["projects"] for p in body["co_partners"])


def test_suggest_why_uses_counts_when_known_and_strength_when_not(client):
    out = {s["id"]: s for s in client.get("/api/suggest?topic=1&ids=1,2").json()}
    # Partners reached, not summed pair counts: one paper with members 1 and 2
    # sits on two edges and must not read as "2 works".
    assert out[5]["why"] == "co-authored with 2 and shared EU projects with 1 of your partners · 4 EU projects in total"
    assert out[6]["why"] == "shared EU projects with 1 of your partners"  # eu_projects == 0: no suffix
    # Legacy candidate keeps the strength wording.
    assert out[7]["why"] == "co-authorship ties with 1 of your partners · 2 EU projects in total"


def test_suggest_why_singular_total():
    from routers.suggest import _why
    assert _why(set(), 1, 1, 0, 1, True) == "shared EU projects with 1 of your partners · 1 EU project in total"
    assert _why({"coauthor"}, 1, 0, 0, 0, True) == "co-authorship ties with 1 of your partners"  # nothing known: strength


def test_migration_adds_missing_columns_idempotently():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    with engine.begin() as c:  # the OLD schema: no split columns
        c.execute(text("CREATE TABLE collaboration_edge (id INTEGER PRIMARY KEY, source_institution_id INTEGER, "
                       "target_institution_id INTEGER, topic_id INTEGER, type VARCHAR, weight FLOAT)"))
        c.execute(text("INSERT INTO collaboration_edge (source_institution_id, target_institution_id, topic_id, type, weight) "
                       "VALUES (1, 2, 1, 'coauthor', 3)"))
    assert ensure_edge_split_columns(engine) == ["coauthor_weight", "project_weight"]
    assert ensure_edge_split_columns(engine) == []  # second run: no-op
    cols = {c["name"] for c in inspect(engine).get_columns("collaboration_edge")}
    assert {"coauthor_weight", "project_weight"} <= cols
    with engine.connect() as c:
        assert c.execute(text("SELECT coauthor_weight, project_weight FROM collaboration_edge")).one() == (0, 0)


def test_migration_skips_missing_table():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    assert ensure_edge_split_columns(engine) == []


# ── ETL: graph.py split ───────────────────────────────────────────────────────
def test_graph_records_split_per_pair():
    from graph import build_graph

    # 1-2 co-author twice and share 2 projects; 2-3 co-author once; 1-3 share one project only.
    G, _ = build_graph([[1, 2], [1, 2], [2, 3]], [[1, 2], [1, 2, 3]])
    e12, e23, e13 = G[1][2], G[2][3], G[1][3]
    assert (e12["type"], e12["coauthor_weight"], e12["project_weight"], e12["weight"]) == ("coauthor", 2.0, 2.0, 3.0)
    assert (e23["type"], e23["coauthor_weight"], e23["project_weight"], e23["weight"]) == ("coauthor", 1.0, 1.0, 1.5)
    assert (e13["type"], e13["coauthor_weight"], e13["project_weight"], e13["weight"]) == ("project", 0.0, 1.0, 1.0)
    for _, _, d in G.edges(data=True):
        if d["coauthor_weight"]:  # combined weight keeps its old meaning
            assert d["coauthor_weight"] + 0.5 * d["project_weight"] == d["weight"]


# ── ETL: strict matching ──────────────────────────────────────────────────────
def test_accept_match_rule():
    from match import accept_match

    assert accept_match("fuzzy_high", 92.0, False)
    assert accept_match("ror", 95.0, False)
    assert not accept_match("fuzzy_review", 80.0, False)   # unconfirmed 75-90: rejected by default
    assert accept_match("fuzzy_review", 80.0, True)        # ...unless the flag opts in
    assert not accept_match("unmatched", 0.0, True)
    assert not accept_match("fuzzy_high", 60.0, False)     # below the floor never counts


def test_strict_matching_is_the_default():
    import config

    assert config.ACCEPT_UNCONFIRMED_FUZZY is False
