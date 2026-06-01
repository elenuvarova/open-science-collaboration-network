from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from models import TopicBrief
from schemas import BriefOut

router = APIRouter(prefix="/api/brief", tags=["brief"])


@router.get("", response_model=BriefOut)
def get_brief(topic: int, db: Session = Depends(get_db)):
    brief = db.query(TopicBrief).filter_by(topic_id=topic).first()
    if not brief:
        raise HTTPException(
            status_code=404,
            detail="Brief not yet generated for this topic. Run the ETL with GROQ_API_KEY set.",
        )
    return BriefOut(
        topic_id=brief.topic_id,
        text=brief.text,
        generated_at=brief.generated_at,
        model=brief.model,
    )
