from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from db import get_db
from models import CollaborationEdge, Institution, InstitutionMetric
from ratelimit import limiter
from schemas import GraphEdge, GraphNode, GraphOut

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("", response_model=GraphOut)
@limiter.limit("60/minute")
def get_graph(
    request: Request,
    topic: Optional[int] = None,
    type: Optional[str] = None,
    limit: int = Query(300, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    iq = (
        db.query(Institution, InstitutionMetric)
        .outerjoin(InstitutionMetric, InstitutionMetric.institution_id == Institution.id)
    )
    if topic is not None:
        iq = iq.filter(InstitutionMetric.topic_id == topic)
    if type:
        iq = iq.filter(Institution.type == type)
    iq = iq.order_by(InstitutionMetric.degree_centrality.desc().nullslast()).limit(limit)

    rows = iq.all()
    node_ids = {inst.id for inst, _ in rows}
    nodes = [
        GraphNode(
            id=inst.id,
            label=inst.name,
            type=inst.type or "unknown",
            community_id=metric.community_id if metric else None,
            centrality=metric.degree_centrality if metric else 0.0,
        )
        for inst, metric in rows
    ]

    edges_q = db.query(CollaborationEdge).filter(
        CollaborationEdge.source_institution_id.in_(node_ids),
        CollaborationEdge.target_institution_id.in_(node_ids),
    )
    if topic is not None:
        edges_q = edges_q.filter(CollaborationEdge.topic_id == topic)
    edges = [
        GraphEdge(
            source=e.source_institution_id,
            target=e.target_institution_id,
            type=e.type,
            weight=e.weight,
        )
        for e in edges_q.all()
    ]
    return GraphOut(nodes=nodes, edges=edges)
