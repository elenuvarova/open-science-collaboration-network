"""GET /api/calls with the EU Funding & Tenders API mocked out (no network, no model)."""
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import eu_calls
from db import SessionLocal
from main import app
from models import Topic

client = TestClient(app)


def _iso(days: int) -> str:
    # The app counts days in UTC; using the local date here broke the test
    # whenever local and UTC dates differed (around midnight).
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat() + "T00:00:00.000+0000"


def _hit(identifier, title, description, deadlines, status="31094502", action="HORIZON  Research and Innovation Actions"):
    return {"metadata": {
        "identifier": [identifier],
        "title": [title],
        "status": [status],
        "deadlineDate": deadlines,
        "typesOfAction": [action],
        "callIdentifier": [identifier.rsplit("-", 2)[0]],
        "callTitle": ["Test call"],
        "descriptionByte": f"['<p>{description}</p>']",
        "budgetOverview": ['{"budgetTopicActionMap":{"1":[{"action":"%s - HORIZON-RIA HORIZON  Research and Innovation Actions",'
                          '"expectedGrants":3,"minContribution":3000000,"maxContribution":4000000,'
                          '"budgetYearMap":{"2027":"12000000"}}]}}' % identifier],
    }}


PAGE = {"results": [
    _hit("HORIZON-CL6-2027-01-SOIL-01", "Living labs to enhance soil health",
         "Soil health, soil carbon and soil biodiversity in regenerative agriculture.", [_iso(40)]),
    _hit("HORIZON-CL5-2027-01-D1-10", "Understanding and avoiding maladaptation to climate change",
         "Climate adaptation and climate resilience, flood risk and drought.", [_iso(10), _iso(90)],
         status="31094501", action="HORIZON Coordination and Support Actions"),
    _hit("HORIZON-CL5-2027-01-D1-11", "Coastal adaptation pilots",
         "Climate adaptation for coastal cities facing flood risk.", [_iso(5)],
         action="HORIZON Innovation Actions"),
    _hit("HORIZON-EIC-2023-OLD-01", "Soil health, expired cut-offs only",
         "Soil health.", [_iso(-30)]),  # only past deadlines -> dropped
    _hit("HORIZON-CL4-2027-01-PHOTONICS-01", "Ultra-low power photonic devices",
         "Integrated photonics, lasers and waveguides.", [_iso(20)]),
]}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    eu_calls.reset_cache()
    monkeypatch.setattr(eu_calls, "_get_model", lambda: None)  # keyword-only matching
    with SessionLocal() as db:
        db.query(Topic).delete()
        db.add_all([
            Topic(id=1, name="Climate adaptation",
                  keywords=["climate adaptation", "climate resilience", "flood risk", "drought"]),
            Topic(id=2, name="Soil health", keywords=["soil health", "soil carbon", "soil biodiversity"]),
            Topic(id=3, name="Digital health", keywords=["digital health", "telemedicine"]),
        ])
        db.commit()
    yield
    eu_calls.reset_cache()


@pytest.fixture
def portal(monkeypatch):
    calls = []

    def fake_post_page(page):
        calls.append(page)
        return PAGE

    monkeypatch.setattr(eu_calls, "_post_page", fake_post_page)
    return calls


def _down(monkeypatch):
    def boom(page):
        raise RuntimeError("EC is down")

    monkeypatch.setattr(eu_calls, "_post_page", boom)


def test_matches_sorted_by_nearest_deadline(portal):
    body = client.get("/api/calls?topic=1").json()
    assert body["stale"] is False
    assert [c["identifier"] for c in body["calls"]] == [
        "HORIZON-CL5-2027-01-D1-11",   # 5 days
        "HORIZON-CL5-2027-01-D1-10",   # 10 days
    ]
    first, second = body["calls"]
    assert first["type_of_action"] == "IA" and second["type_of_action"] == "CSA"
    assert second["status"] == "forthcoming"
    assert first["days_left"] == 5
    assert second["deadlines"][0] < second["deadlines"][1]       # two-stage: both listed
    assert first["budget_eur"] == 12_000_000 and first["max_contribution_eur"] == 4_000_000
    assert first["expected_grants"] == 3
    assert first["url"].endswith("/topic-details/HORIZON-CL5-2027-01-D1-11")
    assert 0.35 <= first["match_score"] <= 1.0


def test_each_topic_gets_only_its_own_calls(portal):
    soil = client.get("/api/calls?topic=2").json()["calls"]
    assert [c["identifier"] for c in soil] == ["HORIZON-CL6-2027-01-SOIL-01"]
    assert client.get("/api/calls?topic=3").json()["calls"] == []   # nothing matches -> empty, not an error


def test_expired_calls_never_returned(portal):
    ids = [c["identifier"] for c in client.get("/api/calls?topic=2").json()["calls"]]
    assert "HORIZON-EIC-2023-OLD-01" not in ids


def test_cached_for_12h(portal):
    client.get("/api/calls?topic=1")
    client.get("/api/calls?topic=2")
    assert portal == [1]            # one upstream page, second request served from cache


def test_upstream_down_without_cache_is_empty_and_stale(monkeypatch):
    _down(monkeypatch)
    r = client.get("/api/calls?topic=1")
    assert r.status_code == 200
    assert r.json()["calls"] == [] and r.json()["stale"] is True


def test_upstream_down_serves_stale_cache(portal, monkeypatch):
    assert client.get("/api/calls?topic=1").json()["calls"]
    eu_calls._cache["fetched_at"] -= eu_calls.CACHE_TTL + 1        # expire the cache
    _down(monkeypatch)
    body = client.get("/api/calls?topic=1").json()
    assert body["stale"] is True
    assert len(body["calls"]) == 2   # old copy still served
    # ...and a failed refresh backs off instead of retrying on every request
    failed_at = eu_calls._cache["failed_at"]
    client.get("/api/calls?topic=1")
    assert eu_calls._cache["failed_at"] == failed_at


def test_unknown_topic_404(portal):
    assert client.get("/api/calls?topic=999").status_code == 404


def test_topic_required():
    assert client.get("/api/calls").status_code == 422


def test_security_headers_unchanged(portal):
    r = client.get("/api/calls?topic=1")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "connect-src 'self' https://stats.ontwrpn.com" in r.headers["content-security-policy"]
