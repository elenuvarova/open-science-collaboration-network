"""GET /api/suggest — rank institutions outside the consortium that are
connected to it, blending tie strength with partner_fit_score. Read-only."""
import math
from collections import defaultdict
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from db import get_db
from edge_split import edge_split
from models import CollaborationEdge, Institution, InstitutionMetric
from ratelimit import limiter
from schemas import SuggestionOut

router = APIRouter(prefix="/api/suggest", tags=["suggest"])

# Same role -> institution-type mapping as the GapView roles. The DB holds
# OpenAlex types (education/company/...) but seeded data uses university etc.
ROLE_TYPES = {
    "research": ["education", "university"],
    "technical": ["company", "facility"],
    "policy": ["government", "public_body"],
    "ngo": ["nonprofit", "ngo"],
}

MAX_IDS = 50
LIMIT = 10
TIE_WEIGHT = 0.6  # share of the blended score from graph ties; the rest is fit


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


def _why(types: set, partners: int, eu_projects: int, works: float = 0.0, shared: float = 0.0, known: bool = False) -> str:
    who = f"{partners} of your partners"
    if known:
        # Split known: clean counts (co-authored works / shared EU projects).
        w, p = round(works), round(shared)
        wt = f"{w} {'work' if w == 1 else 'works'}"
        pt = f"{p} EU {'project' if p == 1 else 'projects'}"
        if w and p:
            text = f"co-authored {wt} and shared {pt} with {who}"
        elif w:
            text = f"co-authored {wt} with {who}"
        else:
            text = f"shared {pt} with {who}"
        return text + (f" · {eu_projects} EU projects in total" if eu_projects else "")
    # A "coauthor" edge may also carry shared EU projects (the ETL folds them in),
    # so only a project-only edge can be described as "EU projects".
    if "coauthor" in types:
        parts = [f"co-authorship ties with {who}"]
    else:
        parts = [f"in EU projects with {who}"]
    if eu_projects:
        parts.append(f"EU projects {eu_projects}")
    return " · ".join(parts)


@router.get("", response_model=list[SuggestionOut])
@limiter.limit("30/minute")
def suggest(
    request: Request,
    topic: int = Query(...),
    ids: str = Query(..., description="comma-separated consortium institution ids"),
    role: Optional[Literal["research", "technical", "policy", "ngo"]] = None,
    db: Session = Depends(get_db),
):
    members = _parse_ids(ids)
    member_set = set(members)

    # Edges between a consortium member and anyone outside it (indexed FKs).
    edges = db.query(CollaborationEdge).filter(
        CollaborationEdge.topic_id == topic,
        (CollaborationEdge.source_institution_id.in_(members))
        | (CollaborationEdge.target_institution_id.in_(members)),
    ).all()

    # Summed weight per (candidate, member) pair first, so coauthor + project
    # edges between the same two institutions add up.
    pair: dict[tuple[int, int], float] = defaultdict(float)
    etypes: dict[int, set] = defaultdict(set)
    counts: dict[int, list] = defaultdict(lambda: [0.0, 0.0, True])  # cand -> works, projects, split known
    for e in edges:
        s, t = e.source_institution_id, e.target_institution_id
        if (s in member_set) == (t in member_set):
            continue  # both inside the consortium: not a candidate link
        cand, member = (t, s) if s in member_set else (s, t)
        pair[(cand, member)] += e.weight or 0.0
        if e.type:
            etypes[cand].add(e.type)
        works, projects, known = edge_split(e)
        c = counts[cand]
        c[0] += works
        c[1] += projects
        c[2] = c[2] and known  # any legacy edge: describe this candidate by strength
    if not pair:
        return []

    # Log-damp each member's tie so one very heavy edge can't swamp the rank,
    # then sum: being linked to several partners beats one strong link.
    tie: dict[int, float] = defaultdict(float)
    linked: dict[int, set] = defaultdict(set)
    for (cand, member), w in pair.items():
        tie[cand] += math.log1p(w)
        linked[cand].add(member)

    q = (
        db.query(Institution, InstitutionMetric)
        .outerjoin(
            InstitutionMetric,
            (InstitutionMetric.institution_id == Institution.id) & (InstitutionMetric.topic_id == topic),
        )
        .filter(Institution.id.in_(list(tie)))
    )
    if role:
        q = q.filter(Institution.type.in_(ROLE_TYPES[role]))
    rows = q.all()
    if not rows:
        return []

    # Scale tie strength to 0-1 against the strongest candidate.
    top = max(tie[inst.id] for inst, _ in rows) or 1.0

    out = []
    for inst, m in rows:
        fit = (m.partner_fit_score if m else 0.0) or 0.0
        eu = (m.eu_projects if m else 0) or 0
        score = 100 * (TIE_WEIGHT * tie[inst.id] / top + (1 - TIE_WEIGHT) * fit / 100)
        out.append(SuggestionOut(
            id=inst.id,
            name=inst.name,
            country=inst.country,
            type=inst.type,
            partner_fit_score=fit,
            eu_projects=eu,
            score=round(score, 1),
            linked_partners=len(linked[inst.id]),
            why=_why(etypes[inst.id], len(linked[inst.id]), eu, *counts[inst.id]),
        ))
    out.sort(key=lambda s: (-s.score, s.id))
    return out[:LIMIT]
