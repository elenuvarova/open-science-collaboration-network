import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from db import Base, db_kind, engine
from routers import graph, health, institutions, topics

# Models register on Base via import; create tables if missing (no-op when they exist).
import models  # noqa: E402,F401

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Open Science Collaboration Network")

app.include_router(health.router)
app.include_router(topics.router)
app.include_router(institutions.router)
app.include_router(graph.router)

if os.environ.get("NODE_ENV") == "production" or os.environ.get("SERVE_STATIC") == "1":
    public_dir = os.path.join(os.path.dirname(__file__), "public")
    if os.path.isdir(public_dir):
        app.mount("/", StaticFiles(directory=public_dir, html=True), name="static")

print(f"db: {db_kind}")
