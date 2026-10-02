"""GET /api/consortium/ties — who in a hand-picked consortium already works
together. Per pair: the summed CollaborationEdge weight for the topic, split into
coauthor and project. Also the members with no tie to anyone else (isolated), and
up to 5 institutions outside the consortium that could bridge them. Read-only;
uses existing tables only.

A missing tie means "not in the data", not "never worked together": the graph only
covers the topic's top institutions."""
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from db import get_db
from models import CollaborationEdge, Institution, InstitutionMetric, Topic
from ratelimit import limiter
from schemas import BridgeLink, TieBridge, TieMember, TiePair, TiesOut

router = APIRouter(prefix="/api/consortium", tags=["consortium"])

MAX_IDS = 20
MAX_BRIDGES = 5
# A member whose ties to the rest of the consortium sum to less than this (one
# shared work or project, or half of one plus a bit) counts as weakly tied.
WEAK_WEIGHT = 2.0
EDGE_TYPES = ("coauthor", "project")


def _parse_ids(raw: str) -> list[int]:
    try:
        ids = sorted({int(x) for x in raw.split(",") if x.strip()})
    except ValueError:
        raise HTTPException(status_code=422, detail="ids must be comma-separated integers")
    if not ids:
        raise HTTPException(status_code=422, detail="ids must not be empty")
    if len(ids) > MAX_IDS:
        raise HTTPException(status_code=422, detail=f"at most {MAX_IDS} ids")
    return ids


@router.get("/ties", response_model=TiesOut)
@limiter.limit("30/minute")
def ties(
    request: Request,
    topic: int = Query(...),
    ids: str = Query(..., description="comma-separated consortium institution ids (max 20)"),
    db: Session = Depends(get_db),
):
    wanted = _parse_ids(ids)
    if db.get(Topic, topic) is None:
        raise HTTPException(status_code=404, detail="topic not found")

    found = {i.id: i for i in db.query(Institution).filter(Institution.id.in_(wanted)).all()}
    members = [found[i] for i in wanted if i in found]  # unknown ids are dropped
    member_set = set(found)
    out = TiesOut(
        topic_id=topic,
        members=[TieMember(id=m.id, name=m.name, country=m.country, type=m.type) for m in members],
    )
    if not member_set:
        return out

    # Every topic edge touching a member (both FKs are indexed).
    member_ids = list(member_set)
    edges = db.query(CollaborationEdge).filter(
        CollaborationEdge.topic_id == topic,
        or_(
            CollaborationEdge.source_institution_id.in_(member_ids),
            CollaborationEdge.target_institution_id.in_(member_ids),
        ),
    ).all()

    # Edges inside the consortium feed the matrix; edges to an outsider feed the
    # bridge search. Several rows for one pair (or per type) are summed.
    pair: dict[tuple[int, int], dict[str, float]] = defaultdict(lambda: {"coauthor": 0.0, "project": 0.0})
    outside: dict[int, dict[int, float]] = defaultdict(lambda: defaultdict(float))  # outsider -> member -> weight
    for e in edges:
        s, t = e.source_institution_id, e.target_institution_id
        w = e.weight or 0.0
        if s == t or w <= 0 or e.type not in EDGE_TYPES:
            continue
        if s in member_set and t in member_set:
            pair[(min(s, t), max(s, t))][e.type] += w
        else:
            member, other = (s, t) if s in member_set else (t, s)
            outside[other][member] += w

    out.pairs = sorted(
        (
            TiePair(a=a, b=b, coauthor=round(w["coauthor"], 2), project=round(w["project"], 2),
                    weight=round(w["coauthor"] + w["project"], 2))
            for (a, b), w in pair.items()
        ),
        key=lambda p: (-p.weight, p.a, p.b),
    )

    # With a single member "isolated" is meaningless, so say nothing about it.
    if len(member_set) < 2:
        return out

    total: dict[int, float] = defaultdict(float)
    for p in out.pairs:
        total[p.a] += p.weight
        total[p.b] += p.weight
    out.isolated = [m for m in sorted(member_set) if total[m] == 0]
    out.weak = [m for m in sorted(member_set) if 0 < total[m] < WEAK_WEIGHT]
    needy = set(out.isolated) | set(out.weak)

    # A bridge is an outsider tied to two or more members, at least one of them
    # isolated or weakly tied: adding it gives that member a path into the group.
    cands = {c: links for c, links in outside.items() if len(links) >= 2 and needy & set(links)}
    if not cands:
        return out

    rows = (
        db.query(Institution, InstitutionMetric)
        .outerjoin(
            InstitutionMetric,
            (InstitutionMetric.institution_id == Institution.id) & (InstitutionMetric.topic_id == topic),
        )
        .filter(Institution.id.in_(list(cands)))
        .all()
    )

    def rank(row):
        inst, metric = row
        links = cands[inst.id]
        fit = (metric.partner_fit_score if metric else 0.0) or 0.0
        # Most isolated/weak members reached, then most members, then tie weight, then fit.
        return (-len(needy & set(links)), -len(links), -sum(links.values()), -fit, inst.id)

    bridges = []
    for inst, metric in sorted(rows, key=rank)[:MAX_BRIDGES]:
        links = cands[inst.id]
        bridges.append(TieBridge(
            id=inst.id,
            name=inst.name,
            country=inst.country,
            type=inst.type,
            partner_fit_score=(metric.partner_fit_score if metric else 0.0) or 0.0,
            eu_projects=(metric.eu_projects if metric else 0) or 0,
            connects=[
                BridgeLink(member_id=m, weight=round(w, 2))
                for m, w in sorted(links.items(), key=lambda kv: (-kv[1], kv[0]))
            ],
        ))
    out.bridges = bridges
    return out
