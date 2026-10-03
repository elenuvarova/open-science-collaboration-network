"""GET /api/institutions/{id}/delivery — what the EU projects an institution took
part in have publicly produced (CORDIS deliverables + publications, per project).

Outputs belong to the projects, not to the partner: the counts are summed over the
institution's projects and say nothing about who inside a consortium made what.
Read-only; project_output is filled by etl/outputs.py."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import case, func, select, true
from sqlalchemy.orm import Session

from db import get_db
from models import Institution, Project, ProjectOutput, ProjectParticipant
from ratelimit import limiter
from schemas import DeliveryOut, DeliveryTotals
from topic_match import institution_on_topic
from params import InstitutionId, OptTopicId

router = APIRouter(prefix="/api/institutions", tags=["delivery"])


def _total(col):
    return func.coalesce(func.sum(col), 0)


@router.get("/{institution_id}/delivery", response_model=DeliveryOut)
@limiter.limit("60/minute")
def get_delivery(
    request: Request,
    institution_id: InstitutionId,
    topic: OptTopicId = None,
    db: Session = Depends(get_db),
):
    if db.get(Institution, institution_id) is None:
        raise HTTPException(status_code=404, detail="institution not found")

    # With a topic, only that topic's projects (same keyword rule as the evidence endpoint).
    on_topic = institution_on_topic(db, topic, institution_id) if topic is not None else true()

    # Each project once, even if the institution is listed twice on it.
    mine = select(ProjectParticipant.project_id).where(
        ProjectParticipant.institution_id == institution_id
    ).distinct()

    has_outputs = (ProjectOutput.deliverables + ProjectOutput.publications) > 0
    has_demo_or_data = (ProjectOutput.demonstrators + ProjectOutput.datasets) > 0
    (total, with_outputs, deliverables, demonstrators, datasets, reports, other,
     publications, with_demo_or_data, updated_at) = (
        db.query(
            func.count(Project.id),
            _total(case((has_outputs, 1), else_=0)),
            _total(ProjectOutput.deliverables),
            _total(ProjectOutput.demonstrators),
            _total(ProjectOutput.datasets),
            _total(ProjectOutput.reports),
            _total(ProjectOutput.other),
            _total(ProjectOutput.publications),
            _total(case((has_demo_or_data, 1), else_=0)),
            func.max(ProjectOutput.updated_at),
        )
        .select_from(Project)
        .outerjoin(ProjectOutput, ProjectOutput.project_id == Project.id)
        .filter(Project.id.in_(mine), on_topic)
        .one()
    )

    return DeliveryOut(
        institution_id=institution_id,
        topic_id=topic,
        available=db.query(ProjectOutput.id).first() is not None,
        projects_total=total,
        projects_with_outputs=int(with_outputs),
        totals=DeliveryTotals(
            deliverables=int(deliverables),
            demonstrators=int(demonstrators),
            datasets=int(datasets),
            reports=int(reports),
            other=int(other),
            publications=int(publications),
        ),
        projects_with_demonstrator_or_dataset=int(with_demo_or_data),
        # Shares are over ALL the institution's projects: one that CORDIS lists
        # nothing for counts as having delivered nothing public, not as unknown.
        demonstrator_or_dataset_share=round(int(with_demo_or_data) / total, 3) if total else None,
        publications_per_project=round(int(publications) / total, 1) if total else None,
        updated_at=updated_at,
    )
