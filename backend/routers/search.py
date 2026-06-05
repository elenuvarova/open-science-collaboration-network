from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from db import get_db
from models import Work, WorkEmbedding
from ratelimit import limiter
from schemas import WorkSearchResult

router = APIRouter(prefix="/api/search", tags=["search"])

_model = None


def _get_model():
    global _model
    if _model is None:
        try:
            from fastembed import TextEmbedding
            _model = TextEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")
        except Exception:
            return None
    return _model


# Embedding search loads a topic's full embedding set and runs a matmul per call,
# so it's the most expensive endpoint — throttle it per client IP (M1).
@router.get("", response_model=list[WorkSearchResult])
@limiter.limit("30/minute")
def search_works(
    request: Request,
    q: str,
    topic: int,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    model = _get_model()
    if model is None:
        raise HTTPException(status_code=503, detail="Embedding model not available")

    import numpy as np

    rows = (
        db.query(WorkEmbedding, Work)
        .join(Work, WorkEmbedding.work_id == Work.id)
        .filter(Work.topic_id == topic)
        .all()
    )
    if not rows:
        return []

    q_vec = np.array(next(model.embed([q.strip()])))
    embeddings = np.array([r.WorkEmbedding.embedding for r in rows])
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    sims = (embeddings / np.maximum(norms, 1e-9)) @ q_vec

    top_idxs = np.argsort(-sims)[: min(limit, len(rows))]
    results = []
    for i in top_idxs:
        we, w = rows[i].WorkEmbedding, rows[i].Work
        abstract = w.abstract or ""
        results.append(WorkSearchResult(
            id=w.id,
            title=w.title or "",
            year=w.year,
            doi=w.doi,
            cited_by_count=w.cited_by_count or 0,
            abstract_snippet=abstract[:220].rstrip() + ("…" if len(abstract) > 220 else ""),
            similarity=round(float(sims[i]), 3),
        ))
    return results
