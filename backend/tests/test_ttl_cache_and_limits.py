"""The graph cache and the rate limits on the endpoints that had none."""
import time

from fastapi.testclient import TestClient

import main
from ttl_cache import TTLCache


def test_ttl_cache_reuses_expires_and_evicts():
    cache = TTLCache(ttl=0.2, max_items=2)
    builds = []
    build = lambda k: (lambda: builds.append(k) or k)  # noqa: E731
    assert cache.get_or_build("a", build("a")) == "a"
    assert cache.get_or_build("a", build("a")) == "a"
    assert builds == ["a"]  # second call served from cache
    cache.get_or_build("b", build("b"))
    cache.get_or_build("c", build("c"))  # evicts "a" (least recently used)
    cache.get_or_build("a", build("a"))
    assert builds == ["a", "b", "c", "a"]
    time.sleep(0.25)
    cache.get_or_build("a", build("a"))  # expired: rebuilt
    assert builds[-1] == "a" and len(builds) == 5


def test_graph_second_call_is_cached(monkeypatch):
    from routers import graph
    calls = []
    real = graph._build_graph
    monkeypatch.setattr(graph, "_build_graph", lambda *a: calls.append(1) or real(*a))
    client = TestClient(main.app)
    assert client.get("/api/graph?limit=20").status_code == 200
    assert client.get("/api/graph?limit=20").status_code == 200
    assert len(calls) == 1


def test_previously_unlimited_endpoints_now_limited():
    from ratelimit import limiter
    client = TestClient(main.app)
    try:
        codes = [client.get("/api/topics").status_code for _ in range(125)]
        assert codes.count(429) >= 1 and codes[0] == 200
    finally:
        limiter.reset()  # don't leave other tests rate-limited
