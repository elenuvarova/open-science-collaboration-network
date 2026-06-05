# Open Science Collaboration Network

A Python-powered intelligence platform that maps research-collaboration networks from open data (OpenAlex + CORDIS), scores potential partners, and reveals consortium gaps — so a team can **find the right research partners before writing the grant**. React frontend, FastAPI backend, a Python ETL pipeline, and PostgreSQL. Runs locally with zero setup (SQLite built in) and **deploys as a single Docker container** on Coolify — uvicorn serves the SPA + API, the ETL runs as an in-process weekly scheduler against the container's own PostgreSQL.

See **[PLAN.md](PLAN.md)** for the full architecture, data model, ETL design, roadmap, and the researched free-tier decisions.

## Stack

- **Frontend:** React 18 + Vite 5 (JavaScript), Cytoscape.js for the network graph
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

**Seed some demo data** (until the full ETL lands), in another shell:

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
   - `OPENALEX_API_KEY`, `GROQ_API_KEY` — used by the ETL.
   - `ENABLE_SCHEDULER=1` — turns on the in-process ETL scheduler.
3. **Populate:** on first boot with an empty DB, the scheduler runs the ETL once
   to populate, then re-runs it **weekly (Mondays 04:00 UTC)** in a background
   thread. No manual step and no external cron required.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | DB connectivity → `{ status, db }` |
| GET | `/api/topics` | Seeded research topics |
| GET | `/api/institutions` | Ranked partner shortlist (filters: topic, country, type, min_score) |
| GET | `/api/institutions/{id}` | Institution profile + Partner Fit Score breakdown |
| GET | `/api/graph` | Nodes + edges for the collaboration network |
