"""An expired calls cache is served at once (stale) while one background thread
refreshes it — a slow EU portal must not block requests."""
import threading
import time

import eu_calls


def test_expired_cache_served_immediately_and_refreshed_once(monkeypatch):
    started = threading.Event()
    release = threading.Event()
    calls_made = []

    def slow_fetch():
        calls_made.append(1)
        started.set()
        release.wait(5)
        return [{"identifier": "NEW"}]

    monkeypatch.setattr(eu_calls, "fetch_calls", slow_fetch)
    monkeypatch.setattr(eu_calls, "embed_calls", lambda calls: None)
    with eu_calls._lock:
        eu_calls._cache.update(calls=[{"identifier": "OLD"}],
                               fetched_at=time.time() - eu_calls.CACHE_TTL - 10, failed_at=0.0)

    t0 = time.time()
    calls, stale, _ = eu_calls.get_calls()
    again, _, _ = eu_calls.get_calls()
    assert time.time() - t0 < 1.0                       # did not wait for the slow fetch
    assert calls[0]["identifier"] == "OLD" and stale is True
    assert again[0]["identifier"] == "OLD"
    assert started.wait(2) and len(calls_made) == 1     # exactly one refresh in flight

    release.set()
    for _ in range(50):
        if eu_calls.get_calls()[0][0]["identifier"] == "NEW":
            break
        time.sleep(0.05)
    calls, stale, _ = eu_calls.get_calls()
    assert calls[0]["identifier"] == "NEW" and stale is False
