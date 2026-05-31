# Open Science Collaboration Network — Implementation Plan

> **A Python-powered intelligence platform that maps research-collaboration networks from open data (OpenAlex + CORDIS), scores potential partners, surfaces clusters and consortium gaps — so a team can *find the right research partners before writing the grant*.**

This plan is the source of truth for the build. It was produced after researching the live (2025/2026) free-tier reality of every dependency — several of which have changed since the original spec was written.

---

## 0. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Backend architecture** | **Python FastAPI core** (Architecture A) | Spec mandates a Python core; networkx / rapidfuzz / scikit-learn / sentence-transformers have no Node equivalent. One backend language. The React frontend from the existing template is kept; the Node/Express backend is replaced. |
| **Seed topic** | **Climate adaptation** (Europe) | 227k focused European works (2020–2025); flagship EU Mission → dense CORDIS consortia; clear clusters; best consortium-gap demo. 2nd seed: Soil health. |
| **Database** | **Neon** free Postgres | 0.5 GB, **never expires**, pgvector + HNSW built in, commercial OK, no card. (Render free Postgres now **expires in 30 days** — unusable.) |
| **ETL runtime** | **GitHub Actions** cron | Free unlimited minutes on public repos, 6 hr/job. Runs the whole pipeline; doubles as a keep-alive ping for Neon + the API. |
| **API host** | **Render** free web service (FastAPI) | Free, native Python. Accept ~1 min cold start, or keep warm via the ETL ping. Fallback: Hugging Face Spaces (16 GB RAM) if embeddings need more memory at request time. |
| **Frontend host** | **Vercel / Cloudflare Pages** | Free static hosting + CDN. |
| **Graph viz** | **Cytoscape.js** (`react-cytoscapejs`) | MIT, built-in force layout + cluster coloring + centrality-based node sizing. Scale-up path: Sigma.js + graphology (WebGL + Louvain) for 10k+ nodes. |
| **Total cost** | **$0** | Every layer is genuinely free; see §10. |

---

## 1. The free-stack reality (what changed vs the original spec)

| Dependency | Spec assumed | Reality today | Plan response |
|---|---|---|---|
| OpenAlex API | free, polite pool | **metered: $1/day free**; mailto pool removed; CC0 bulk snapshot still free (330 GB) | MVP = scoped live API calls (one topic + Europe) inside the free $1/day. Snapshot = scale-up path only. |
| CORDIS | free | ✅ free bulk CSV/JSON, CC BY 4.0, no auth | download once → Postgres |
| ORCID | optional (v2) | ⚠️ Public API **non-commercial only** | excluded from any commercial path; v2 enrichment with caveat |
| Render Postgres | "90 days" | ❌ **30-day expiry**, then deleted | **use Neon instead** |
| Fly.io / Railway free | — | ❌ trial credits only now | excluded |
| Embeddings / LLM | "later" | local `all-MiniLM-L6-v2` + pgvector; briefs via **Groq** free + **Gemini Flash-Lite** fallback (HF Inference API effectively dead) | all AI generated in the batch job, never per-request |

---

## 2. Architecture

```
        ┌──────────────── GitHub Actions (cron: weekly, free) ─────────────────┐
        │  etl/run.py                                                           │
        │   1. OpenAlex (pyalex, scoped: topic + Europe + 2020-2025)            │
        │   2. CORDIS bulk CSV (Horizon Europe + H2020)                         │
        │   3. normalize org names → ROR match → rapidfuzz CORDIS↔OpenAlex      │
        │   4. networkx graph: co-authorship + project-participation edges      │
        │   5. centrality (degree, betweenness) + Louvain communities           │
        │   6. Partner Fit Score (weighted)                                     │
        │   7. (v2) sentence-transformers embeddings → pgvector                 │
        │   8. write all precomputed tables → Neon Postgres                     │
        └───────────────────────────────────┬──────────────────────────────────┘
                                             ▼
                          Neon Postgres (free · never expires · pgvector)
                                             ▲  reads only
                                             │
   React/Vite (Vercel) ──/api──►  FastAPI (Render)  ── thin read layer + (v2) RAG
   Cytoscape graph                 SQLAlchemy ORM
```

**Core insight:** the product is *batch-computed and read-heavy*. All hard work (matching, graph metrics, ML clustering, scoring, embeddings) happens offline in the ETL. The FastAPI layer only **reads precomputed tables** → it stays thin, fast, and cheap.

---

## 3. Repository structure

```
.
├── frontend/                     # React + Vite (KEPT from template, extended)
│   ├── vite.config.js            #   proxy /api → http://localhost:8000
│   └── src/
│       ├── api.js                #   fetch helpers
│       ├── pages/                #   TopicSearch, NetworkMap, InstitutionProfile,
│       │                         #   Shortlist, GapView
│       └── components/           #   GraphCanvas (cytoscape), ScoreCard, FilterBar
├── backend/                      # Python FastAPI (REPLACES Node/Express)
│   ├── requirements.txt
│   ├── main.py                   #   app + router includes + prod static serving
│   ├── db.py                     #   SQLAlchemy engine from DATABASE_URL (Neon|SQLite)
│   ├── models.py                 #   SQLAlchemy ORM (shared schema, source of truth)
│   ├── schemas.py                #   Pydantic response models
│   └── routers/                  #   health, topics, institutions, graph, scores
├── etl/                          # Python pipeline (runs in GitHub Actions)
│   ├── requirements.txt
│   ├── run.py                    #   orchestrator
│   ├── config.py                 #   topic + country + year config
│   ├── sources/{openalex,cordis,ror}.py
│   ├── normalize.py  match.py  graph.py  score.py  load.py
├── .github/workflows/etl.yml     # scheduled ETL cron
├── render.yaml                   # FastAPI web service; DATABASE_URL from Neon (secret)
├── Dockerfile                    # Render build: deps + built frontend → backend/public
├── .env.example  .gitignore  .dockerignore
├── PLAN.md  README.md
```

**Schema sharing:** `backend/models.py` is the single source of truth for table definitions. `etl/load.py` imports those same SQLAlchemy models (the repo is one package) so the writer and reader never drift.

---

## 4. Data model (Neon Postgres)

Mirrors spec §7, normalized for the graph:

- **topic** — `id, name, keywords[], (v2) embedding`
- **institution** — `id, name, normalized_name, country, city, type(university|company|ngo|public_body), openalex_id, ror_id, cordis_pic(nullable), match_confidence`
- **author** — `id, name, openalex_id, orcid(nullable), institution_id`
- **work** — `id, openalex_id, title, year, abstract, doi, cited_by_count, topic_id`
- **project** — `id, cordis_id, title, abstract, programme, start_date, end_date, ec_contribution, countries[]`
- **work_authorship** — `work_id, author_id, institution_id, country` (co-authorship source)
- **project_participant** — `project_id, institution_id, role(coordinator|participant)`
- **collaboration_edge** — `source_institution_id, target_institution_id, type(coauthor|project), weight`
- **institution_metric** — `institution_id, topic_id, degree_centrality, betweenness, community_id, partner_fit_score, score_breakdown(jsonb), recent_works, eu_projects`

Indexes: `institution.normalized_name`, `institution.country`, `collaboration_edge(source,target)`, `institution_metric(topic_id, partner_fit_score desc)`.

---

## 5. ETL pipeline (the core — `etl/`)

| Step | Module | What it does | Free? |
|---|---|---|---|
| 1 | `sources/openalex.py` | `pyalex`, free key. Pull works for the topic, filtered `institutions.continent:europe`, `publication_year:2020-2025`. Cursor-paginate. Extract works + `authorships` (authors, institutions, countries) + topics + citations. Stay under $1/day by scoping. | ✅ |
| 2 | `sources/cordis.py` | `requests` download Horizon Europe + H2020 ZIPs from data.europa.eu, unzip, load `project.csv` + `organization.csv` with pandas. Filter to climate-adaptation topics/EuroSciVoc. | ✅ |
| 3 | `normalize.py` | Lowercase, strip legal suffixes (GmbH/SA/Ltd), standardize "University/Università/…", strip accents. | ✅ |
| 4 | `sources/ror.py` + `match.py` | Map names → **ROR ID** (ROR free affiliation API), **block by country**, `rapidfuzz` match CORDIS org → OpenAlex institution (which carries ROR). Store **per-match confidence** + manual-review tier. **The hard part / main risk.** | ✅ |
| 5 | `graph.py` | Build networkx graph: co-authorship edges (shared works) + project-participation edges (shared CORDIS projects). Compute degree + betweenness centrality; **Louvain** community detection (`python-louvain`). | ✅ |
| 6 | `score.py` | **Partner Fit Score** (spec §5.2): 30% topic relevance, 20% pub activity, 20% EU-project participation, 15% network centrality, 10% country/consortium diversity, 5% recency. Store score + `score_breakdown` JSON for the "why". | ✅ |
| 7 *(v2)* | `embed.py` | `sentence-transformers all-MiniLM-L6-v2` on abstracts → pgvector (HNSW) in Neon. | ✅ |
| 8 | `load.py` | Idempotent upsert of all tables into Neon. | ✅ |

Orchestrated by `etl/run.py`; scheduled weekly in `.github/workflows/etl.yml` with `DATABASE_URL` + `OPENALEX_API_KEY` as GitHub secrets.

---

## 6. API contract (FastAPI — read-only over precomputed tables)

- `GET /api/health` → `{status, db}` (SQLAlchemy `SELECT 1`)
- `GET /api/topics` → seeded topics
- `GET /api/institutions?topic=&country=&type=&min_score=&sort=fit` → ranked list (Screen 4 shortlist)
- `GET /api/institutions/{id}?topic=` → profile + score breakdown + clusters + EU projects (Screen 3)
- `GET /api/graph?topic=&countries=&type=&bridges_only=` → `{nodes[], edges[]}` for Cytoscape (Screen 2)
- `GET /api/gaps?topic=&shortlist=ids` → consortium role coverage vs gaps (Screen 5)
- *(v2)* `POST /api/brief` → RAG-backed strategy brief (Groq/Gemini, generated server-side from precomputed context)

---

## 7. Frontend screens (React/Vite, reuse template shell)

| Screen | Spec | Component |
|---|---|---|
| 1 Topic Search | §8.1 | `pages/TopicSearch` + `FilterBar` (country, year, org type) |
| 2 Network Map | §8.2 | `pages/NetworkMap` + `GraphCanvas` (Cytoscape, fcose layout, color by community, size by centrality, filters: EU-only, bridges-only, country) |
| 3 Institution Profile | §8.3 | `pages/InstitutionProfile` + `ScoreCard` (fit score + breakdown + clusters + EU projects + suggested role) |
| 4 Partner Shortlist | §8.4 | `pages/Shortlist` (ranked Partner Fit list) |
| 5 Consortium Gap View | §8.5 | `pages/GapView` (role coverage: research/technical/end-user/policy/evaluation/geography) |
| 6 AI Brief *(v2)* | §8.6 / §9 | RAG brief generation |

---

## 8. Phased roadmap

### MVP v1 (the deliverable)
OpenAlex + CORDIS → Python ETL → institution/project/topic graph → Partner Fit Score → Louvain clusters → FastAPI reads → React dashboard with Screens 1–5. Seed topic: **climate adaptation, Europe**. Short rule-based "brief" text (no full RAG yet).

**Build order:**
1. Repo scaffold to Architecture A (FastAPI + etl skeleton, runs on SQLite locally). ← *next*
2. ETL steps 1–2 (OpenAlex + CORDIS ingest) → raw tables.
3. ETL steps 3–4 (normalize + ROR/rapidfuzz match). ← *highest-risk; validate early*
4. ETL steps 5–6 (graph metrics + Partner Fit Score).
5. FastAPI read endpoints + Pydantic schemas.
6. Frontend Screens 1–4 (search, graph, profile, shortlist).
7. Screen 5 (gap view) + deploy (Neon + GitHub Actions + Render + Vercel).

### v2
RAG over abstracts + project summaries (pgvector + Groq/Gemini briefs), Crossref enrichment, consortium builder, saved partner lists, exportable report, email alerts, ORCID enrichment (non-commercial caveat).

---

## 9. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Entity matching CORDIS↔OpenAlex** (no shared ID) | High | Pivot through ROR; block by country; rapidfuzz with confidence score; manual-review tier; accept long-tail SME misses. Validate on a small sample first (step 3). |
| OpenAlex $1/day metering | Medium | Scope queries tightly (one topic + continent + year range); cache raw pulls; snapshot fallback for scale. |
| Free API host cold start (~1 min) | Low | ETL keep-alive ping; or HF Spaces. Read-heavy app tolerates it. |
| Neon 0.5 GB cap | Low | MVP one topic fits easily; prune raw works after deriving edges. |
| ORCID non-commercial licence | Medium | Excluded from commercial path; v2-only with explicit caveat. |
| Graph too large for Cytoscape | Low | Cap MVP to top-N institutions by activity; Sigma.js if it grows. |

---

## 10. Cost = $0 (confirmed)

OpenAlex (scoped, free key) · CORDIS (free, CC BY) · ROR (free) · Neon Postgres (free, no expiry) · GitHub Actions (free on public repo) · Render web service (free) · Vercel/Cloudflare Pages (free) · sentence-transformers (free, local) · pgvector (free) · Groq + Gemini briefs (free tiers, batch-generated). No paid API tier anywhere.
