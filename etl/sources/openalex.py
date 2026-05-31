"""OpenAlex source — scoped, free-tier pull.

Free key from openalex.org/settings/api (set OPENALEX_API_KEY). Scoping to one
topic + Europe + recent years keeps the run inside the $1/day free allowance.
The query below was validated against the live API (~227k works for this scope).

TODO (Phase 2):
  - configure pyalex (api_key) and cursor-paginate Works up to MAX_WORKS
  - for each work, extract authorships → (author, institution, country)
  - return dataclasses/dicts: works[], institutions[], authors[], authorships[]
"""
import os

import config

API_KEY = os.environ.get("OPENALEX_API_KEY")


def build_filter() -> str:
    return (
        f"publication_year:{config.YEAR_FROM}-{config.YEAR_TO},"
        f"institutions.continent:{config.CONTINENT}"
    )


def fetch_works():
    """Return scoped works with embedded authorships. STUB — Phase 2."""
    # import pyalex
    # pyalex.config.api_key = API_KEY
    # from pyalex import Works
    # query = Works().search(config.TOPIC_SEARCH).filter(...)
    # for page in query.paginate(per_page=200, n_max=config.MAX_WORKS): ...
    raise NotImplementedError("openalex.fetch_works — implement in Phase 2")
