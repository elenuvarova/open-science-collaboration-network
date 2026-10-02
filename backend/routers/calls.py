from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from db import get_db
from eu_calls import MIN_SCORE, days_left, get_calls, match_score
from models import Topic
from ratelimit import limiter
from schemas import CallOut, CallsOut

router = APIRouter(prefix="/api/calls", tags=["calls"])


# Open + forthcoming Horizon Europe topics matched to a noda topic. The portal is
# read at most twice a day (eu_calls caches 12 h); a failed refresh serves the
# stale copy — or an empty list — with stale=true instead of an error.
@router.get("", response_model=CallsOut)
@limiter.limit("60/minute")
def list_calls(
    request: Request,
    topic: int = Query(...),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    t = db.get(Topic, topic)
    if t is None:
        raise HTTPException(status_code=404, detail="topic not found")

    calls, stale, fetched_at = get_calls()
    today = datetime.now(timezone.utc).date()
    keywords = list(t.keywords or [])

    matched = []
    for c in calls:
        left = days_left(c, today)
        if left is None:  # the cache can outlive a deadline by up to 12 h
            continue
        score = match_score(t.name, keywords, c)
        if score < MIN_SCORE:
            continue
        upcoming = [d for d in c["deadlines"] if d >= today.isoformat()]
        matched.append(CallOut(
            identifier=c["identifier"],
            title=c["title"],
            type_of_action=c["type_of_action"],
            status=c["status"],
            deadlines=upcoming,
            next_deadline=upcoming[0],
            days_left=left,
            budget_eur=c["budget_eur"],
            max_contribution_eur=c["max_contribution_eur"],
            expected_grants=c["expected_grants"],
            call_identifier=c["call_identifier"],
            call_title=c["call_title"],
            url=c["url"],
            match_score=score,
        ))

    matched.sort(key=lambda m: (m.next_deadline, -m.match_score))
    return CallsOut(topic_id=topic, calls=matched[:limit], fetched_at=fetched_at, stale=stale)
