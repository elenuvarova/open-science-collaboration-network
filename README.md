# Open Science Collaboration Network

A Python-powered intelligence platform that maps research-collaboration networks from open data (OpenAlex + CORDIS), scores potential partners, and reveals consortium gaps — so a team can **find the right research partners before writing the grant**. React frontend, FastAPI backend, a Python ETL pipeline, and PostgreSQL. Runs locally with zero setup (SQLite built in) and **deploys for $0** (Neon + GitHub Actions + Render + Vercel).

See **[PLAN.md](PLAN.md)** for the full architecture, data model, ETL design, roadmap, and the researched free-tier decisions.

## Stack

- **Frontend:** React 18 + Vite 5 (JavaScript), Cytoscape.js for the network graph
- **Backend:** Python + FastAPI + SQLAlchemy — **SQLite locally, PostgreSQL (Neon) in production** (picked automatically from `DATABASE_URL`)
- **ETL:** Python (pyalex, pandas, networkx, rapidfuzz) — runs on a **GitHub Actions** cron, writes precomputed results to Postgres
- **Data:** OpenAlex (CC0) + CORDIS (CC BY 4.0) + ROR — all free, no paid API tier
- **Deploy (all free):** Neon Postgres (never expires) · GitHub Actions (ETL) · Render (API) · Vercel/Cloudflare Pages (frontend)

## Project structure

```
.
├── frontend/          React + Vite (network map, profiles, shortlist)
├── backend/           FastAPI read API over precomputed tables
│   ├── main.py  db.py  models.py  schemas.py  routers/
├── etl/               Python pipeline (OpenAlex + CORDIS → graph → scores → DB)
│   ├── run.py  config.py  sources/  normalize.py  match.py  graph.py  score.py  load.py
├── .github/workflows/etl.yml
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

1. **Database:** create a free [Neon](https://neon.com) Postgres project; copy the connection string.
2. **ETL:** push to GitHub (public repo). Add `DATABASE_URL` and `OPENALEX_API_KEY` as repo secrets. The workflow in `.github/workflows/etl.yml` runs weekly (and on demand) to populate Postgres.
3. **API:** in Render, **New → Blueprint**, connect the repo. Set `DATABASE_URL` (the Neon string) in the dashboard. The free web service sleeps after ~15 min idle (~1 min cold start); the ETL ping keeps it warm.
4. **Frontend:** deploy `frontend/` to Vercel or Cloudflare Pages.

> **Why Neon, not Render Postgres?** Render's free Postgres now **expires after 30 days**. Neon's free tier (0.5 GB) **never expires** and includes `pgvector` for the v2 RAG layer.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | DB connectivity → `{ status, db }` |
| GET | `/api/topics` | Seeded research topics |
| GET | `/api/institutions` | Ranked partner shortlist (filters: topic, country, type, min_score) |
| GET | `/api/institutions/{id}` | Institution profile + Partner Fit Score breakdown |
| GET | `/api/graph` | Nodes + edges for the collaboration network |
