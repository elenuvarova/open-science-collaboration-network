import os

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from db import Base, db_kind, engine
from routers import brief, graph, health, institutions, topics

# Models register on Base via import; create tables if missing (no-op when they exist).
import models  # noqa: E402,F401

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Open Science Collaboration Network")

app.include_router(health.router)
app.include_router(topics.router)
app.include_router(institutions.router)
app.include_router(graph.router)
app.include_router(brief.router)

if os.environ.get("NODE_ENV") == "production" or os.environ.get("SERVE_STATIC") == "1":
    public_dir = os.path.join(os.path.dirname(__file__), "public")
    if os.path.isdir(public_dir):
        # Mount only the /assets/ subdir — avoids app.mount("/") intercepting /api/* routes.
        assets_dir = os.path.join(public_dir, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        # Catch-all for SPA client-side routing. Registered last so /api/* routes
        # (inserted above) are matched first.
        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str = ""):
            return FileResponse(os.path.join(public_dir, "index.html"))

print(f"db: {db_kind}")
