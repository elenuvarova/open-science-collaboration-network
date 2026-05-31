"""ETL orchestrator (Phase 2 target).

Runs in GitHub Actions on a weekly cron (see .github/workflows/etl.yml). Pulls
from OpenAlex + CORDIS, matches entities, builds the graph, scores partners, and
writes everything to Postgres (Neon). Until Phase 2 lands, use seed_sample.py for
local demo data.

Pipeline (PLAN.md §5):
  1. openalex.fetch_works()           -> works, authorships
  2. cordis.fetch_projects()          -> projects, participants
  3. normalize + ror.match + match    -> resolved institutions
  4. graph.build_graph()              -> edges, centrality, communities
  5. score.partner_fit_score()        -> partner fit per institution
  6. load.*                           -> upsert into Postgres
"""
import config
import load


def main():
    load.init_schema()
    print(f"ETL start — topic: {config.TOPIC_NAME}, scope: {config.CONTINENT} "
          f"{config.YEAR_FROM}-{config.YEAR_TO}")
    # Phase 2: wire sources → match → graph → score → load (see module stubs).
    raise NotImplementedError(
        "Full ETL not yet implemented — run `python seed_sample.py` for demo data."
    )


if __name__ == "__main__":
    main()
