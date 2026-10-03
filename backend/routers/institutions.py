from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import get_db
from models import Institution, InstitutionMetric
from schemas import InstitutionScored
from params import InstType, InstitutionId, OptTopicId

router = APIRouter(prefix="/api/institutions", tags=["institutions"])


def _scored(inst: Institution, metric: Optional[InstitutionMetric]) -> InstitutionScored:
    return InstitutionScored(
        id=inst.id,
        name=inst.name,
        country=inst.country,
        type=inst.type,
        ror_id=inst.ror_id,
        partner_fit_score=metric.partner_fit_score if metric else 0.0,
        score_breakdown=metric.score_breakdown if metric else {},
        community_id=metric.community_id if metric else None,
        eu_projects=metric.eu_projects if metric else 0,
        recent_works=metric.recent_works if metric else 0,
    )


@router.get("", response_model=list[InstitutionScored])
def list_institutions(
    topic: OptTopicId = None,
    country: Optional[str] = Query(None, pattern=r"^[A-Za-z]{2}$"),
    countries: Optional[str] = Query(None, max_length=300, pattern=r"^[A-Za-z, ]*$",
                                     description="Comma-separated ISO-2 codes, e.g. widening countries"),
    type: InstType = None,
    min_score: float = Query(0.0, ge=0, le=100),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = (
        db.query(Institution, InstitutionMetric)
        .outerjoin(InstitutionMetric, InstitutionMetric.institution_id == Institution.id)
    )
    if topic is not None:
        q = q.filter(InstitutionMetric.topic_id == topic)
    if country:
        q = q.filter(Institution.country == country)
    if countries:
        codes = [c.strip().upper() for c in countries.split(",") if c.strip()][:60]
        q = q.filter(Institution.country.in_(codes))
    if type:
        q = q.filter(Institution.type == type)
    q = q.filter((InstitutionMetric.partner_fit_score >= min_score) | (InstitutionMetric.id.is_(None)))
    q = q.order_by(InstitutionMetric.partner_fit_score.desc().nullslast()).limit(limit)
    return [_scored(inst, metric) for inst, metric in q.all()]


@router.get("/{institution_id}", response_model=InstitutionScored)
def get_institution(
    institution_id: InstitutionId,
    topic: OptTopicId = None,
    db: Session = Depends(get_db),
):
    inst = db.query(Institution).get(institution_id)
    if inst is None:
        raise HTTPException(status_code=404, detail="institution not found")
    mq = db.query(InstitutionMetric).filter(InstitutionMetric.institution_id == institution_id)
    if topic is not None:
        mq = mq.filter(InstitutionMetric.topic_id == topic)
    return _scored(inst, mq.first())
