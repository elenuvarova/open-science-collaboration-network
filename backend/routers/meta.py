"""Dataset-level facts the UI states as claims: freshness, totals, and how funded
consortia on a topic are actually composed (the benchmark for the Gap view).

Both are cheap aggregates over tables the weekly ETL already fills, cached for an
hour so the landing page and the Gap view never hit the DB on every request."""
import statistics
import time
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from db import get_db
from models import (
    CollaborationEdge,
    Institution,
    InstitutionMetric,
    Project,
    ProjectParticipant,
    TopicBrief,
    Work,
)
from schemas import BenchmarkOut, MetaOut

router = APIRouter(prefix="/api", tags=["meta"])

_TTL = 3600
_cache: dict = {}


def _cached(key, build):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]
    value = build()
    _cache[key] = (time.monotonic(), value)
    return value


@router.get("/meta", response_model=MetaOut)
def get_meta(db: Session = Depends(get_db)):
    def build():
        # The brief is written in the same ETL run as the scores, so its timestamp
        # is the best available "data as of" without a separate run log.
        as_of = db.query(func.max(TopicBrief.generated_at)).scalar()
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
def get_benchmark(topic: int = Query(...), db: Session = Depends(get_db)):
    """How funded consortia look on this topic: EU projects (CORDIS) that at least
    one institution in the topic's network took part in. Country counts come from
    CORDIS's own participant list, so they cover every partner, matched or not."""
    def build():
        in_topic = (
            select(ProjectParticipant.project_id)
            .join(InstitutionMetric, InstitutionMetric.institution_id == ProjectParticipant.institution_id)
            .where(InstitutionMetric.topic_id == topic)
            .distinct()
        )
        projects = db.query(Project.countries, Project.programme).filter(Project.id.in_(in_topic)).all()
        country_counts = [len(set(c or [])) for c, _ in projects if c]
        programmes = Counter(p or "other" for _, p in projects)

        coord_types = Counter(
            (t or "unknown")
            for (t,) in db.query(Institution.type)
            .join(ProjectParticipant, ProjectParticipant.institution_id == Institution.id)
            .filter(ProjectParticipant.project_id.in_(in_topic), ProjectParticipant.role == "coordinator")
            .all()
        )
        n_coord = sum(coord_types.values()) or 1
        return BenchmarkOut(
            topic_id=topic,
            projects=len(projects),
            median_countries=statistics.median(country_counts) if country_counts else None,
            p25_countries=_quantile(country_counts, 0.25) if country_counts else None,
            p75_countries=_quantile(country_counts, 0.75) if country_counts else None,
            programmes=dict(programmes),
            coordinator_types={k: round(v / n_coord, 3) for k, v in coord_types.most_common()},
        )
    return _cached(("benchmark", topic), build)
