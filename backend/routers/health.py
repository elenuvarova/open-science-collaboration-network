from fastapi import APIRouter
from sqlalchemy import text

from db import db_kind, engine

router = APIRouter()


@router.get("/api/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": db_kind}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "message": str(exc)}


@router.get("/api/hello")
def hello():
    return {"message": "Hello from the backend 👋"}
