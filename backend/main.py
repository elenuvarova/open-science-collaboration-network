import os
import threading

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from db import Base, db_kind, engine
from eu_calls import get_calls
from ratelimit import limiter
from routers import brief, calls, evidence, graph, health, institutions, meta, search, suggest, topics
from scheduler import start_scheduler

# Models register on Base via import; create tables if missing (no-op when they exist).
import models  # noqa: E402,F401

Base.metadata.create_all(bind=engine)

app = FastAPI(title="noda")

# Compress JSON + the JS/CSS bundles (they were going out uncompressed).
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Security headers on every response. CSP allows exactly what the SPA loads:
# own assets, Google Fonts, and the self-hosted Umami script + beacon.
_CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://stats.ontwrpn.com",
    "connect-src 'self' https://stats.ontwrpn.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
])


@app.middleware("http")
async def _headers(request: Request, call_next):
    response = await call_next(request)
    h = response.headers
    h.setdefault("Content-Security-Policy", _CSP)
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    path = request.url.path
    if path.startswith("/assets/"):
        # Vite emits content-hashed filenames — safe to cache forever.
        h["Cache-Control"] = "public, max-age=31536000, immutable"
    elif not path.startswith("/api/"):
        # HTML shells must revalidate so a deploy shows up immediately.
        h.setdefault("Cache-Control", "no-cache")
    return response


# Per-IP rate limiting (slowapi). Endpoints opt in via @limiter.limit(...).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(health.router)
app.include_router(topics.router)
app.include_router(institutions.router)
app.include_router(evidence.router)
app.include_router(graph.router)
app.include_router(brief.router)
app.include_router(search.router)
app.include_router(meta.router)
app.include_router(suggest.router)
app.include_router(calls.router)


@app.on_event("startup")
def _start_etl_scheduler() -> None:
    # Spawns a daemon thread (or no-ops if ENABLE_SCHEDULER != 1) and returns
    # immediately — never blocks the port bind or the event loop. The thread
    # populates an empty DB once, then runs the ETL weekly (Mon 04:00 UTC).
    start_scheduler()
    # Warm the Horizon calls cache off the request path so the first visit to the
    # Calls page isn't the one that pays for the fetch + embedding (~20 s).
    if os.environ.get("CALLS_WARMUP", "1") == "1":
        threading.Thread(target=get_calls, name="calls-warmup", daemon=True).start()

if os.environ.get("NODE_ENV") == "production" or os.environ.get("SERVE_STATIC") == "1":
    public_dir = os.path.join(os.path.dirname(__file__), "public")
    if os.path.isdir(public_dir):
        # Mount only the /assets/ subdir — avoids app.mount("/") intercepting /api/* routes.
        assets_dir = os.path.join(public_dir, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        # Catch-all for SPA client-side routing. Registered last so /api/* routes
        # (inserted above) are matched first.
        @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
        async def serve_spa(full_path: str = ""):
            # Serve a real root-level static file (favicon.svg, robots.txt, …)
            # if it exists directly in public/; otherwise fall through to the SPA
            # shell. The single-segment + no-".." guard blocks path traversal.
            if full_path and "/" not in full_path and ".." not in full_path:
                candidate = os.path.join(public_dir, full_path)
                if os.path.isfile(candidate):
                    return FileResponse(candidate)
            # The tool lives under /app and gets the plain shell; everything else
            # gets index.html, which carries the prerendered landing page.
            if full_path == "app" or full_path.startswith("app/"):
                app_shell = os.path.join(public_dir, "app.html")
                if os.path.isfile(app_shell):
                    return FileResponse(app_shell)
            # Unknown paths still get the landing (no dead end for people) but with
            # a real 404 status, so crawlers don't index soft-404 duplicates.
            status = 200 if full_path in ("", "index.html") else 404
            return FileResponse(os.path.join(public_dir, "index.html"), status_code=status)

print(f"db: {db_kind}")
