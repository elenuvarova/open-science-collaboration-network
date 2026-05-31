from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db import get_db
from models import Topic
from schemas import TopicOut

router = APIRouter(prefix="/api/topics", tags=["topics"])


@router.get("", response_model=list[TopicOut])
def list_topics(db: Session = Depends(get_db)):
    return db.query(Topic).order_by(Topic.name).all()
