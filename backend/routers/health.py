import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from db import db_kind, engine

router = APIRouter()
logger = logging.getLogger("api.health")


@router.get("/api/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": db_kind}
    except Exception:  # noqa: BLE001
        # Log the full error server-side, but never echo it to the client — a raw
        # driver exception can leak the DB host/name/user. Return a generic 503.
        logger.exception("health check failed")
        return JSONResponse(status_code=503, content={"status": "error"})


@router.get("/api/hello")
def hello():
    return {"message": "Hello from the backend 👋"}
