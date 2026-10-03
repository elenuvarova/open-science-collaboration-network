"""Open + forthcoming Horizon Europe call topics, matched to noda topics.

Source: the EU Funding & Tenders Portal search API (public, key `SEDIA`).
  POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=100&pageNumber=N
  multipart/form-data, every part sent as application/json:
    query     {"bool":{"must":[{"terms":{"type":["1","2"]}},
                               {"terms":{"status":["31094501","31094502"]}},   # forthcoming, open
                               {"terms":{"frameworkProgramme":["43108390"]}},   # Horizon Europe
                               {"term":{"DATASOURCE":"SEDIA"}}]}}               # current portal data only
    languages ["en"]
    sort      {"order":"DESC","field":"deadlineDate"}   # latest deadline first
  The API ignores date range filters, and some "open" topics (EIC, MSCA…) keep a
  status of open with only past cut-offs, so past deadlines are dropped here.

Everything is cached in memory for 12 h, so the portal is hit at most twice a
day. If a refresh fails we keep serving the stale copy (flagged `stale`). The last
good fetch is also kept in the database (calls_snapshot): a restart within 12 h
reads it instead of the portal, and when the portal is down or blocks us after a
restart, the page shows that copy (stale) rather than nothing.
"""
import html
import json
import logging
import re
import threading
import time
from datetime import date, datetime, timezone
from typing import Optional

import requests

logger = logging.getLogger("api.calls")

SEARCH_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
PAGE_SIZE = 100
MAX_PAGES = 8              # safety cap: 800 topics (there are ~360 live)
HTTP_TIMEOUT = 25          # seconds, per page
CACHE_TTL = 12 * 3600      # a refresh at most twice a day
RETRY_AFTER = 10 * 60      # after a failed refresh, don't hammer the EC for 10 min

_QUERY = {"bool": {"must": [
    {"terms": {"type": ["1", "2"]}},                              # call topics
    {"terms": {"status": ["31094501", "31094502"]}},              # forthcoming + open
    {"terms": {"frameworkProgramme": ["43108390"]}},              # Horizon Europe
    {"term": {"DATASOURCE": "SEDIA"}},                            # current portal data
]}}
_LANGUAGES = ["en"]
_SORT = {"order": "DESC", "field": "deadlineDate"}

STATUS = {"31094501": "forthcoming", "31094502": "open"}
PORTAL_TOPIC_URL = (
    "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/"
)

# Text of the call used for matching: title + the first slice of the description.
DESCRIPTION_CHARS = 1200


# ── Fetch ──────────────────────────────────────────────────────────────────

def _post_page(page: int) -> dict:
    # Each multipart part must carry Content-Type: application/json (else HTTP 500).
    files = {
        "query": (None, json.dumps(_QUERY), "application/json"),
        "languages": (None, json.dumps(_LANGUAGES), "application/json"),
        "sort": (None, json.dumps(_SORT), "application/json"),
    }
    resp = requests.post(
        SEARCH_URL,
        params={"apiKey": "SEDIA", "text": "***", "pageSize": PAGE_SIZE, "pageNumber": page},
        files=files,
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_calls(today: Optional[date] = None) -> list[dict]:
    """Fetch every live call topic, parsed and with expired deadlines dropped.

    Results are sorted by latest deadline first, so we stop paging as soon as a
    page contains nothing still open for submission.
    """
    today = today or datetime.now(timezone.utc).date()
    calls: dict[str, dict] = {}
    for page in range(1, MAX_PAGES + 1):
        data = _post_page(page)
        results = data.get("results") or []
        live_on_page = 0
        for raw in results:
            call = parse_call(raw, today)
            if call:
                live_on_page += 1
                calls[call["identifier"]] = call
        if len(results) < PAGE_SIZE or live_on_page == 0:
            break
    return list(calls.values())


# ── Parse ──────────────────────────────────────────────────────────────────

def _first(md: dict, key: str) -> Optional[str]:
    v = md.get(key)
    if isinstance(v, list):
        return v[0] if v else None
    return v


def _text(value) -> str:
    """Strip HTML from a field the API sometimes wraps as the repr of a list."""
    if isinstance(value, list):
        value = " ".join(str(v) for v in value)
    s = re.sub(r"<[^>]+>", " ", str(value or ""))
    s = html.unescape(s).replace("\\n", " ").replace("\\'", "'")
    s = re.sub(r"^\s*\[\s*'|'\s*\]\s*$", "", s)
    return re.sub(r"\s+", " ", s).strip()


def type_of_action(label: Optional[str]) -> Optional[str]:
    """'HORIZON  Research and Innovation Actions' -> 'RIA' etc."""
    t = re.sub(r"\s+", " ", label or "").lower()
    if not t:
        return None
    for needle, short in (
        ("research and innovation", "RIA"),
        ("innovation actions", "IA"),
        ("coordination and support", "CSA"),
        ("cofund", "COFUND"),
        ("pre-commercial", "PCP"),
        ("public procurement", "PPI"),
        ("msca", "MSCA"),
        ("erc", "ERC"),
        ("eic", "EIC"),
        ("prize", "Prize"),
    ):
        if needle in t:
            return short
    return None


def _budget(md: dict, identifier: str) -> dict:
    """Pull this topic's budget out of the call-wide budgetOverview JSON string."""
    out = {"budget_eur": None, "max_contribution_eur": None, "expected_grants": None}
    raw = md.get("budgetOverview")
    if isinstance(raw, list):
        raw = raw[0] if raw else None
    if not raw or "{" not in raw:
        return out
    try:
        overview = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
        actions = [
            a
            for lst in overview.get("budgetTopicActionMap", {}).values()
            for a in lst
            if str(a.get("action", "")).startswith(identifier + " ")
        ]
    except (ValueError, AttributeError, TypeError):
        return out
    if not actions:
        return out
    total = sum(float(v) for a in actions for v in (a.get("budgetYearMap") or {}).values())
    maxes = [a["maxContribution"] for a in actions if a.get("maxContribution")]
    grants = sum(int(a.get("expectedGrants") or 0) for a in actions)
    out["budget_eur"] = total or None
    out["max_contribution_eur"] = float(max(maxes)) if maxes else None
    out["expected_grants"] = grants or None
    return out


def parse_call(raw: dict, today: date) -> Optional[dict]:
    """One search hit -> a compact call dict, or None if it can't be applied to any more."""
    md = raw.get("metadata") or {}
    identifier = _first(md, "identifier")
    title = _first(md, "title") or raw.get("summary")
    status = STATUS.get(_first(md, "status") or "")
    if not identifier or not title or not status:
        return None

    deadlines = sorted({d[:10] for d in md.get("deadlineDate") or [] if d and d[:10] >= today.isoformat()})
    if not deadlines:
        return None

    description = _text(md.get("descriptionByte"))[:DESCRIPTION_CHARS]
    call = {
        "identifier": identifier,
        "title": _text(title),
        "type_of_action": type_of_action(_first(md, "typesOfAction")),
        "status": status,
        "deadlines": deadlines,
        "call_title": _text(_first(md, "callTitle")) or None,
        "call_identifier": _first(md, "callIdentifier"),
        "url": PORTAL_TOPIC_URL + identifier,
        "description": description,
        "destination": _text(_first(md, "destinationDescription")),
    }
    call.update(_budget(md, identifier))
    return call


# ── Matching ───────────────────────────────────────────────────────────────

def _get_model():
    """The one MiniLM instance that routers/search.py loads (~100 MB), shared rather
    than loaded twice. Imported lazily to avoid an import cycle at startup."""
    try:
        from routers.search import _get_model as search_model
        return search_model()
    except Exception:  # noqa: BLE001 — offline / no model cache: keyword fallback
        logger.warning("embedding model unavailable; matching calls by keywords only")
        return None


_WORD = re.compile(r"[a-z0-9]+")


def _stem(w: str) -> str:
    # Crude: enough to make "recycling"/"recycle"/"recycled" and "soils"/"soil" collide.
    for suffix in ("ing", "ed", "es", "s", "e"):
        if len(w) > len(suffix) + 3 and w.endswith(suffix):
            return w[: -len(suffix)]
    return w


def _stems(text: str) -> set[str]:
    return {_stem(w) for w in _WORD.findall(text.lower()) if len(w) > 2}


def keyword_score(topic_keywords: list[str], call: dict) -> float:
    """0..1: how many of the topic's keywords/phrases the call's text hits.

    A phrase counts when all of its words (stemmed) appear; a hit in the title
    counts double. Two or more strong hits saturate the score.
    """
    title = _stems(call["title"])
    body = _stems(call["title"] + " " + (call.get("call_title") or "") + " " + call["description"])
    pts = 0.0
    for kw in topic_keywords:
        words = _stems(kw)
        if not words:
            continue
        if words <= title:
            pts += 1.0
        elif words <= body:
            pts += 0.5
    return min(1.0, pts / 2.0)


def call_text(call: dict) -> str:
    return f"{call['title']}. {call['description']}"


def embed_calls(calls: list[dict]) -> None:
    """Attach a unit-norm 'vec' to every call (no-op without the model)."""
    model = _get_model()
    if model is None or not calls:
        return
    import numpy as np
    # Small batches: the default 256 left the API process at ~2.9 GB resident.
    vecs = np.array(list(model.embed([call_text(c) for c in calls], batch_size=32)))
    vecs = vecs / np.maximum(np.linalg.norm(vecs, axis=1, keepdims=True), 1e-9)
    for call, vec in zip(calls, vecs):
        call["vec"] = vec


_topic_vec_cache: dict[str, object] = {}


def _topic_vec(query: str):
    if query not in _topic_vec_cache:
        model = _get_model()
        if model is None:
            return None
        import numpy as np
        v = np.array(next(model.embed([query])))
        _topic_vec_cache[query] = v / max(float(np.linalg.norm(v)), 1e-9)
    return _topic_vec_cache[query]


# Thresholds were calibrated against the live portal (see the PR notes): MiniLM
# cosine between a short topic query and a call text sits ~0.05-0.25 for noise
# and 0.30+ for a real topical fit.
EMBED_FLOOR = 0.28
MIN_SCORE = 0.35


def match_score(topic_name: str, topic_keywords: list[str], call: dict) -> float:
    """0..1 relevance of a call to a noda topic (embedding cosine blended with keyword hits)."""
    kw = keyword_score([topic_name, *topic_keywords], call)
    vec = call.get("vec")
    topic_vec = _topic_vec(f"{topic_name}: {', '.join(topic_keywords)}") if vec is not None else None
    if topic_vec is None:
        return round(kw * 0.8, 3)  # keyword-only mode: cap so scores stay comparable
    sim = float(vec @ topic_vec)
    emb = max(0.0, (sim - EMBED_FLOOR) / (0.60 - EMBED_FLOOR))   # 0.28 -> 0, 0.60 -> 1
    return round(min(1.0, 0.7 * emb + 0.3 * kw), 3)


# ── Cache ──────────────────────────────────────────────────────────────────

_lock = threading.Lock()          # guards _cache reads/writes (held briefly)
_refreshing = threading.Lock()    # at most one fetch at a time
_cache: dict = {"calls": None, "fetched_at": 0.0, "failed_at": 0.0}


def reset_cache() -> None:
    with _lock:
        _cache.update(calls=None, fetched_at=0.0, failed_at=0.0)
    _topic_vec_cache.clear()


def _save_snapshot(calls: list[dict], fetched_at: float) -> None:
    try:
        from db import SessionLocal
        from models import CallsSnapshot
        rows = [{k: v for k, v in c.items() if k != "vec"} for c in calls]
        with SessionLocal() as db:
            db.merge(CallsSnapshot(id=1, fetched_at=fetched_at, payload=rows))
            db.commit()
    except Exception:  # noqa: BLE001 — the in-memory cache still works without it
        logger.exception("calls snapshot: save failed")


def _load_snapshot() -> tuple[Optional[list[dict]], float]:
    try:
        from db import SessionLocal
        from models import CallsSnapshot
        with SessionLocal() as db:
            snap = db.get(CallsSnapshot, 1)
            if snap and snap.payload:
                return list(snap.payload), float(snap.fetched_at or 0.0)
    except Exception:  # noqa: BLE001
        logger.exception("calls snapshot: load failed")
    return None, 0.0


def _fill_from_snapshot(max_age: Optional[float] = None) -> bool:
    """Fill an empty cache from the stored snapshot (optionally only a recent one)."""
    calls, fetched_at = _load_snapshot()
    if not calls or (max_age is not None and time.time() - fetched_at >= max_age):
        return False
    embed_calls(calls)
    with _lock:
        if _cache["calls"] is None:
            _cache.update(calls=calls, fetched_at=fetched_at)
    return True


def _refresh() -> bool:
    """Fetch + embed and swap the cache. Returns True on success. Never raises."""
    try:
        calls = fetch_calls()
        embed_calls(calls)
        now = time.time()
        with _lock:
            _cache.update(calls=calls, fetched_at=now, failed_at=0.0)
        _save_snapshot(calls, now)
        return True
    except Exception:  # noqa: BLE001 — upstream down / shape changed: degrade, don't 500
        logger.exception("EU Funding & Tenders fetch failed")
        with _lock:
            _cache["failed_at"] = time.time()
            empty = _cache["calls"] is None
        if empty:
            _fill_from_snapshot()  # an older copy, served as stale, beats an empty page
        return False


def _refresh_in_background() -> None:
    try:
        _refresh()
    finally:
        _refreshing.release()


def get_calls() -> tuple[list[dict], bool, Optional[str]]:
    """Return (calls, stale, fetched_at_iso). Never raises.

    Fresh within 12 h. Past that, if we already have a copy we return it at once
    (stale=True) and refresh in one background thread — a slow EU portal must not
    hold request threads. Only the very first fill blocks, and only one request
    does the work (the others wait for it). After a failed refresh we wait 10
    minutes before trying again.
    """
    now = time.time()
    with _lock:
        have = _cache["calls"] is not None
        fresh = have and now - _cache["fetched_at"] < CACHE_TTL
        backing_off = now - _cache["failed_at"] < RETRY_AFTER
    if not fresh and not backing_off:
        if have:
            if _refreshing.acquire(blocking=False):
                threading.Thread(target=_refresh_in_background, name="calls-refresh", daemon=True).start()
        else:
            # Nothing to serve yet: one request fills the cache, concurrent ones wait.
            with _refreshing:
                with _lock:
                    have = _cache["calls"] is not None
                if not have and not _fill_from_snapshot(max_age=CACHE_TTL):
                    _refresh()
    with _lock:
        calls = _cache["calls"] or []
        fetched = _cache["fetched_at"]
        stale = not (fetched and time.time() - fetched < CACHE_TTL)
    iso = datetime.fromtimestamp(fetched, timezone.utc).isoformat(timespec="seconds") if fetched else None
    return calls, stale, iso


def days_left(call: dict, today: Optional[date] = None) -> Optional[int]:
    today = today or datetime.now(timezone.utc).date()
    upcoming = [d for d in call["deadlines"] if d >= today.isoformat()]
    if not upcoming:
        return None
    return (date.fromisoformat(upcoming[0]) - today).days
