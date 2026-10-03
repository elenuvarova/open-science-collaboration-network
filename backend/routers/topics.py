from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from db import get_db
from models import Topic
from schemas import TopicOut
from ratelimit import limiter

router = APIRouter(prefix="/api/topics", tags=["topics"])


@router.get("", response_model=list[TopicOut])
@limiter.limit("120/minute")
def list_topics(request: Request, db: Session = Depends(get_db)):
    return db.query(Topic).order_by(Topic.name).all()
