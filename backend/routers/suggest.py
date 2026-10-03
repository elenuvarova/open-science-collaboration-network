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
from params import TopicId, parse_ids

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
    return parse_ids(raw, MAX_IDS)


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _why(types: set, partners: int, eu_projects: int,
         coauthored_with: int = 0, projects_with: int = 0, known: bool = False) -> str:
    # Edges only give per-pair counts: one paper or project shared with three
    # members sits on three edges. So name how many partners each kind of tie
    # reaches, never a summed number of works or projects.
    total = f" · {_plural(eu_projects, 'EU project', 'EU projects')} in total" if eu_projects else ""
    if known and (coauthored_with or projects_with):
        if coauthored_with and projects_with:
            return f"co-authored with {coauthored_with} and shared EU projects with {projects_with} of your partners" + total
        if coauthored_with:
            return f"co-authored with {coauthored_with} of your partners" + total
        return f"shared EU projects with {projects_with} of your partners" + total
    who = f"{partners} of your partners"
    # A "coauthor" edge may also carry shared EU projects (the ETL folds them in),
    # so only a project-only edge can be described as "EU projects".
    text = f"co-authorship ties with {who}" if "coauthor" in types else f"in EU projects with {who}"
    return text + total


@router.get("", response_model=list[SuggestionOut])
@limiter.limit("30/minute")
def suggest(
    request: Request,
    topic: TopicId,
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
    # cand -> members it co-authored with, members it shared projects with, split known
    reach: dict[int, list] = defaultdict(lambda: [set(), set(), True])
    for e in edges:
        s, t = e.source_institution_id, e.target_institution_id
        if (s in member_set) == (t in member_set):
            continue  # both inside the consortium: not a candidate link
        cand, member = (t, s) if s in member_set else (s, t)
        pair[(cand, member)] += e.weight or 0.0
        if e.type:
            etypes[cand].add(e.type)
        works, projects, known = edge_split(e)
        r = reach[cand]
        if works:
            r[0].add(member)
        if projects:
            r[1].add(member)
        r[2] = r[2] and known  # any legacy edge: describe this candidate by strength
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
            why=_why(etypes[inst.id], len(linked[inst.id]), eu,
                     len(reach[inst.id][0]), len(reach[inst.id][1]), reach[inst.id][2]),
        ))
    out.sort(key=lambda s: (-s.score, s.id))
    return out[:LIMIT]
