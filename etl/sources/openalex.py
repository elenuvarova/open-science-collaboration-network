"""OpenAlex source — scoped free-tier pull via pyalex.

Pulls works for the configured topic + Europe + year range. Each work carries
`authorships` with author → institution → country + ROR ID. This is the primary
source for both institution nodes and co-authorship edges.
"""
import os
import sys

import pyalex
from pyalex import Works

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

import config

pyalex.config.api_key = os.environ.get("OPENALEX_API_KEY", "")
pyalex.config.email = "eluvrv@gmail.com"


def _reconstruct_abstract(inv_index) -> str:
    """OpenAlex ships abstracts as an inverted index {word: [positions]}.
    Rebuild the plain text (used for embeddings / semantic search)."""
    if not inv_index:
        return ""
    positions = [(pos, word) for word, idxs in inv_index.items() for pos in idxs]
    positions.sort()
    return " ".join(word for _, word in positions)


def fetch_works(max_works=None):
    """Yield dicts: {openalex_id, title, year, abstract, doi, cited_by_count, institutions, authorships}.

    institutions: list of {openalex_id, name, country, ror_id, type}
    authorships:  list of {author_openalex_id, author_name, institution_openalex_ids}
    """
    limit = max_works or config.MAX_WORKS
    query = (
        Works()
        .search(config.TOPIC_SEARCH)
        .filter(
            publication_year=f"{config.YEAR_FROM}-{config.YEAR_TO}",
            institutions={"continent": config.CONTINENT},
        )
        .sort(cited_by_count="desc")
    )

    seen = 0
    for page in query.paginate(per_page=200, n_max=limit):
        for w in page:
            institutions = {}
            for auth in w.get("authorships", []):
                for inst in auth.get("institutions", []):
                    iid = inst.get("id")
                    if iid and iid not in institutions:
                        institutions[iid] = {
                            "openalex_id": iid,
                            "name": inst.get("display_name", ""),
                            "country": inst.get("country_code", ""),
                            "ror_id": inst.get("ror", ""),
                            "type": inst.get("type", ""),
                        }

            authorships = []
            for auth in w.get("authorships", []):
                inst_ids = [i["id"] for i in auth.get("institutions", []) if i.get("id")]
                if inst_ids:
                    authorships.append({
                        "author_openalex_id": auth["author"]["id"],
                        "author_name": auth["author"]["display_name"],
                        "institution_openalex_ids": inst_ids,
                    })

            yield {
                "openalex_id": w["id"],
                "title": w.get("display_name") or w.get("title", ""),
                "year": w.get("publication_year"),
                "abstract": _reconstruct_abstract(w.get("abstract_inverted_index")),
                "doi": w.get("doi"),
                "cited_by_count": w.get("cited_by_count", 0),
                "institutions": list(institutions.values()),
                "authorships": authorships,
            }
            seen += 1
        print(f"  openalex: {seen} works pulled…", end="\r")

    print(f"  openalex: {seen} works pulled      ")
