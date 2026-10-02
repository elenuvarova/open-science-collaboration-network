"""Dataset-level facts the UI states as claims: freshness, totals, and how funded
consortia on a topic are actually composed (the benchmark for the Gap view).

Both are cheap aggregates over tables the weekly ETL already fills, cached for an
hour so the landing page and the Gap view never hit the DB on every request."""
import statistics
import time
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from db import get_db
from models import (
    CollaborationEdge,
    EtlRun,
    Institution,
    InstitutionMetric,
    Project,
    ProjectParticipant,
    Topic,
    TopicBrief,
    Work,
)
from ratelimit import limiter
from schemas import BenchmarkOut, MetaOut
from topic_match import topic_project_clause

router = APIRouter(prefix="/api", tags=["meta"])

_TTL = 6 * 3600  # data changes weekly; the first build of a topic's benchmark takes seconds
_cache: dict = {}


def _cached(key, build):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]
    value = build()
    _cache[key] = (time.monotonic(), value)
    return value


@router.get("/meta", response_model=MetaOut)
@limiter.limit("60/minute")
def get_meta(request: Request, db: Session = Depends(get_db)):
    def build():
        # Last successful FULL ETL run. No fallback: the brief date moved when only
        # the briefs were regenerated, which would overstate how fresh the scores
        # are. Until the first logged run the UI says "refreshed weekly" instead.
        as_of = (db.query(func.max(EtlRun.finished_at))
                 .filter(EtlRun.ok.is_(True), EtlRun.reason.in_(["weekly", "initial-populate"]))
                 .scalar())
        return MetaOut(
            data_as_of=as_of,
            topics=db.query(func.count(distinct(InstitutionMetric.topic_id))).scalar() or 0,
            institutions=db.query(func.count(distinct(InstitutionMetric.institution_id))).scalar() or 0,
            scores=db.query(func.count(InstitutionMetric.id)).scalar() or 0,
            edges=db.query(func.count(CollaborationEdge.id)).scalar() or 0,
            works=db.query(func.count(Work.id)).scalar() or 0,
            projects=db.query(func.count(Project.id)).scalar() or 0,
        )
    return _cached("meta", build)


def _quantile(values: list[int], q: float) -> float:
    s = sorted(values)
    if not s:
        return 0.0
    i = (len(s) - 1) * q
    lo, hi = int(i), min(int(i) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


@router.get("/benchmark", response_model=BenchmarkOut)
@limiter.limit("60/minute")
def get_benchmark(request: Request, topic: int = Query(...), db: Session = Depends(get_db)):
    # Unknown topics 404 before touching the cache, so a ?topic=1..N loop can't grow it.
    if db.get(Topic, topic) is None:
        raise HTTPException(status_code=404, detail="topic not found")
    return _benchmark(topic, db)


def _benchmark(topic: int, db: Session):
    """How funded consortia look on this topic: multi-country EU projects (CORDIS)
    on the topic's keywords that at least one institution in its network took part
    in. Single-country grants (ERC, MSCA fellowships) are left out — they aren't
    consortia. Country counts come from CORDIS's own participant list, so they
    cover every partner, matched or not."""
    def build():
        in_topic = (
            select(ProjectParticipant.project_id)
            .join(InstitutionMetric, InstitutionMetric.institution_id == ProjectParticipant.institution_id)
            .where(InstitutionMetric.topic_id == topic)
            .distinct()
        )
        rows = (
            db.query(Project.id, Project.countries, Project.programme)
            .filter(Project.id.in_(in_topic), topic_project_clause(db, topic))
            .all()
        )
        projects = [(pid, c, p) for pid, c, p in rows if len(set(c or [])) >= 2]
        consortium_ids = [pid for pid, _, _ in projects]
        country_counts = [len(set(c)) for _, c, _ in projects]
        programmes = Counter(p or "other" for _, _, p in projects)

        coord_types = Counter(
            (t or "unknown")
            for (t,) in db.query(Institution.type)
            .join(ProjectParticipant, ProjectParticipant.institution_id == Institution.id)
            .filter(ProjectParticipant.project_id.in_(consortium_ids), ProjectParticipant.role == "coordinator")
            .all()
        )
        n_matched = sum(coord_types.values())
        n_coord = n_matched or 1
        return BenchmarkOut(
            topic_id=topic,
            projects=len(projects),
            median_countries=statistics.median(country_counts) if country_counts else None,
            p25_countries=_quantile(country_counts, 0.25) if country_counts else None,
            p75_countries=_quantile(country_counts, 0.75) if country_counts else None,
            programmes=dict(programmes),
            coordinator_types={k: round(v / n_coord, 3) for k, v in coord_types.most_common()},
            # Shares cover only coordinators matched to an OpenAlex institution
            # (small companies often aren't), so the UI states the coverage.
            coordinators_identified=n_matched,
        )
    return _cached(("benchmark", topic), build)


def warm_benchmarks() -> None:
    """Build every topic's benchmark once in the background so the first visitor
    to Consortium Gaps doesn't wait for the (slow, keyword-heavy) query."""
    from db import SessionLocal
    from models import Topic

    try:
        with SessionLocal() as db:
            for (topic_id,) in db.query(Topic.id).all():
                _benchmark(topic_id, db)
    except Exception as exc:  # noqa: BLE001 — warm-up is best effort
        print(f"benchmark warm-up skipped: {exc}")
