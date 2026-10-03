"""Out-of-range ids and NUL bytes get a 4xx, never a 500 (security review L1)."""
import pytest
from fastapi.testclient import TestClient

import main

BIG = str(2 ** 63)


@pytest.fixture(scope="module")
def client():
    return TestClient(main.app, raise_server_exceptions=False)


@pytest.mark.parametrize("url", [
    f"/api/brief?topic={BIG}",
    f"/api/institutions/{BIG}",
    f"/api/institutions?topic={BIG}",
    f"/api/institutions/1/evidence?topic={BIG}",
    f"/api/institutions/{BIG}/delivery",
    f"/api/benchmark?topic={BIG}",
    f"/api/graph?topic={BIG}",
    f"/api/calls?topic={BIG}",
    f"/api/search?q=x&topic={BIG}",
    f"/api/consortium/ties?topic=1&ids=1,{BIG}",
    f"/api/suggest?topic=1&ids={BIG}",
    "/api/institutions?topic=0",
    "/api/graph?topic=1&limit=1000",
    "/api/institutions?type=%00",
    "/api/institutions?type=Robert');DROP",
    "/api/institutions?country=BEL",
])
def test_bad_params_are_rejected(client, url):
    r = client.get(url)
    assert 400 <= r.status_code < 500, (url, r.status_code)
    assert r.status_code != 404 or "brief" in url


def test_valid_filters_still_pass(client):
    assert client.get("/api/institutions?country=BE&type=public_body&countries=BG,RO").status_code == 200
    assert client.get("/api/graph?limit=150").status_code == 200


def test_security_headers(client):
    h = client.get("/api/topics").headers
    assert h["permissions-policy"].startswith("camera=()")
    assert h["cross-origin-opener-policy"] == "same-origin"
    assert "server" not in h or "uvicorn" not in h.get("server", "")
    assert client.get("/api/hello").status_code in (404, 405)
