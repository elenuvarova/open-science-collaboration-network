"""GET /api/institutions/{id}/evidence — the CORDIS projects, totals and top
co-partners behind an institution's score. Read-only; uses existing tables only."""
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import case, func, true
from sqlalchemy.orm import Session

from db import get_db
from models import CollaborationEdge, Institution, Project, ProjectParticipant
from ratelimit import limiter
from schemas import CoPartner, EvidenceOut, EvidenceProject, EvidenceTotals
from topic_match import topic_project_clause

router = APIRouter(prefix="/api/institutions", tags=["evidence"])

MAX_PROJECTS = 10
MAX_PARTNERS = 8


def _year(d) -> Optional[int]:
    return d.year if d else None


@router.get("/{institution_id}/evidence", response_model=EvidenceOut, response_model_exclude_none=True)
@limiter.limit("60/minute")
def get_evidence(
    request: Request,
    institution_id: int,
    topic: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    if db.get(Institution, institution_id) is None:
        raise HTTPException(status_code=404, detail="institution not found")

    # With a topic, count only that topic's projects (same keyword stems as the ETL).
    on_topic = topic_project_clause(db, topic) if topic is not None else true()

    # One row per project even if the institution is listed twice on it.
    mine = (
        db.query(
            ProjectParticipant.project_id.label("project_id"),
            func.max(case((ProjectParticipant.role == "coordinator", 1), else_=0)).label("is_coord"),
        )
        .filter(ProjectParticipant.institution_id == institution_id)
        .group_by(ProjectParticipant.project_id)
        .subquery()
    )

    count, coords, ec_total = (
        db.query(
            func.count(mine.c.project_id),
            func.coalesce(func.sum(mine.c.is_coord), 0),
            func.coalesce(func.sum(Project.ec_contribution), 0.0),
        )
        .select_from(mine)
        .join(Project, Project.id == mine.c.project_id)
        .filter(on_topic)
        .one()
    )

    project_rows = (
        db.query(Project, mine.c.is_coord)
        .join(mine, mine.c.project_id == Project.id)
        .filter(on_topic)
        .order_by(Project.start_date.desc().nullslast(), Project.id.desc())
        .limit(MAX_PROJECTS)
        .all()
    )
    projects = [
        EvidenceProject(
            id=p.id,
            title=p.title or "Untitled project",
            programme=p.programme,
            start_year=_year(p.start_date),
            end_year=_year(p.end_date),
            role="coordinator" if is_coord else "participant",
            ec_contribution=p.ec_contribution,
        )
        for p, is_coord in project_rows
    ]

    # Co-partners: every edge touching this institution (either direction),
    # summed per neighbour. Both edge FKs are indexed.
    eq = db.query(CollaborationEdge).filter(
        (CollaborationEdge.source_institution_id == institution_id)
        | (CollaborationEdge.target_institution_id == institution_id)
    )
    if topic is not None:
        eq = eq.filter(CollaborationEdge.topic_id == topic)
    weight: dict[int, float] = defaultdict(float)
    etypes: dict[int, set] = defaultdict(set)
    for e in eq.all():
        other = e.target_institution_id if e.source_institution_id == institution_id else e.source_institution_id
        if other == institution_id:
            continue
        weight[other] += e.weight or 0.0
        if e.type:
            etypes[other].add(e.type)
    top_ids = sorted(weight, key=lambda i: (-weight[i], i))[:MAX_PARTNERS]
    insts = (
        {i.id: i for i in db.query(Institution).filter(Institution.id.in_(top_ids)).all()}
        if top_ids else {}
    )
    co_partners = [
        CoPartner(
            id=i,
            name=insts[i].name,
            country=insts[i].country,
            type=insts[i].type,
            edge_types=sorted(etypes[i]),
            weight=round(weight[i], 2),
        )
        for i in top_ids
        if i in insts
    ]

    return EvidenceOut(
        institution_id=institution_id,
        topic_id=topic,
        projects=projects,
        totals=EvidenceTotals(projects=count, coordinator=int(coords), ec_contribution=float(ec_total)),
        co_partners=co_partners,
    )
