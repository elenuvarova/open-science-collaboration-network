# noda

**Live:** https://noda.science · landing at `/`, the tool at `/app`. (Formerly "Open Science Collaboration Network".)

A Python-powered intelligence platform that maps research-collaboration networks from open data (OpenAlex + CORDIS), scores potential partners, and reveals consortium gaps — so a team can **find the right research partners before writing the grant**. React frontend, FastAPI backend, a Python ETL pipeline, and PostgreSQL. Runs locally with zero setup (SQLite built in) and **deploys as a single Docker container** on Coolify — uvicorn serves the SPA + API, the ETL runs as an in-process weekly scheduler against the container's own PostgreSQL.

See **[PLAN.md](PLAN.md)** for the full architecture, data model, ETL design, roadmap, and the researched free-tier decisions.

## Stack

- **Frontend:** React 18 + Vite 5 (JavaScript), Cytoscape.js for the network graph; landing page prerendered at build time (`src/entry-server.jsx` + `scripts/prerender.mjs`), light theme only, Outfit + Roboto Serif, Streamline Core Line icons
- **Analytics:** self-hosted Umami (cookieless) — custom events in `frontend/src/analytics.js`
- **Backend:** Python + FastAPI + SQLAlchemy — **SQLite locally, PostgreSQL in production** (picked automatically from `DATABASE_URL`)
- **ETL:** Python (pyalex, pandas, networkx, rapidfuzz) — runs as an **in-process weekly scheduler** inside the app, writes precomputed results to Postgres
- **Data:** OpenAlex (CC0) + CORDIS (CC BY 4.0) + ROR — all free, no paid API tier
- **Deploy:** single Docker image on **Coolify** (Hetzner) — uvicorn serves the built SPA + the `/api`, against the container's own PostgreSQL

## Project structure

```
.
├── frontend/          React + Vite (network map, profiles, shortlist)
├── backend/           FastAPI read API over precomputed tables
│   ├── main.py  db.py  models.py  schemas.py  routers/
├── etl/               Python pipeline (OpenAlex + CORDIS → graph → scores → DB)
│   ├── run.py  config.py  sources/  normalize.py  match.py  graph.py  score.py  load.py
├── Dockerfile  render.yaml  PLAN.md
```

## Local development

No database to install — SQLite is built in and created automatically on first run.

**Terminal 1 — backend (FastAPI):**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Seed some demo data** in another shell (the full ETL, `python run.py`, takes hours and needs network access):

```bash
cd etl
pip install -r requirements.txt
python seed_sample.py
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The frontend proxies `/api` to FastAPI on port 8000.

## Deploy (all free)

The app ships as a **single Docker image** (frontend + FastAPI + the bundled ETL)
that runs against the container host's own Postgres — no external DB and no
GitHub Actions cron.

1. **Build & run** the `Dockerfile`. It serves `/api` + the built SPA on port `8000`.
2. **Set env vars** on the container:
   - `DATABASE_URL` — Postgres connection string (no SSL needed for an
     internal/co-located DB; SSL is only used if the URL itself asks for it).
   - `OPENALEX_API_KEY` — used by the ETL.
   - `GROQ_API_KEY`, `GEMINI_API_KEY` — the AI strategy brief: Groq first, Gemini as the
     fallback (`GROQ_MODEL` / `GEMINI_MODEL` pin a model; otherwise one is picked from
     the provider's current list). Runtime variables only, never build-time.
   - `ENABLE_SCHEDULER=1` — turns on the in-process ETL scheduler.
3. **Populate:** on first boot with an empty DB, the scheduler runs the ETL once
   to populate, then re-runs it **weekly (Mondays 04:00 UTC)** in a background
   thread. No manual step and no external cron required.

## Endpoints

All read-only, rate-limited per IP. The OpenAPI schema is at `/openapi.json`
(the interactive `/docs` page is off in production).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | DB connectivity → `{ status, db }` |
| GET | `/api/meta` | Data date and table counts |
| GET | `/api/topics` | The six research topics |
| GET | `/api/institutions` | Ranked partner shortlist (filters: `topic`, `country`, `countries`, `type`, `min_score`) |
| GET | `/api/institutions/{id}` | Institution profile + Partner Fit Score breakdown |
| GET | `/api/institutions/{id}/evidence` | EU projects strictly on the topic, totals, and the closest co-partners |
| GET | `/api/institutions/{id}/delivery` | Deliverables and publications CORDIS lists for those projects |
| GET | `/api/graph` | Nodes + edges for the collaboration network (`limit` ≤ 200) |
| GET | `/api/suggest?topic=&ids=` | Partners outside a consortium who already work with it |
| GET | `/api/consortium/ties?topic=&ids=` | Who in a consortium already works together (≤ 20 ids) |
| GET | `/api/benchmark?topic=` | Size and make-up of funded multi-country consortia on the topic |
| GET | `/api/calls?topic=` | Open + forthcoming Horizon Europe calls matched to a topic, nearest deadline first. Read from the EU Funding & Tenders portal, cached 12 h; `stale: true` when the portal is unreachable |
| GET | `/api/brief?topic=` | The AI strategy brief, regenerated weekly |
| GET | `/api/search?q=&topic=` | Semantic search over the topic's works (embeddings) |

## Tests

```bash
pip install -r backend/requirements-dev.txt -r etl/requirements.txt
cd backend && pytest tests        # API
cd .. && pytest etl/tests         # ETL: ROR outages, participation sweep
```
