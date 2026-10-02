"""Which stored CORDIS projects belong to a topic.

The project table is shared by all topics (the ETL adds each topic's
keyword-matched projects), and nothing records which topic pulled a project in.
We re-apply the ETL's own CORDIS keyword stems from etl/config.py, so "projects
on this topic" means the same thing here as in the pipeline. The stems are read
from the ETL config file (it ships in the image at /app/etl) to keep one source.
"""
import importlib.util
import os
from functools import lru_cache

from itertools import combinations

from sqlalchemy import and_, false, or_

from models import Project, Topic

_ETL_CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "etl", "config.py")


@lru_cache(maxsize=1)
def _stems_by_topic() -> dict[str, list[str]]:
    try:
        spec = importlib.util.spec_from_file_location("noda_etl_config", _ETL_CONFIG)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return {t["name"]: t.get("cordis_keywords") or t["keywords"] for t in mod.TOPICS}
    except Exception:
        return {}


def topic_project_clause(db, topic_id: int):
    """SQL condition: a topic stem in the title, or two different stems in the abstract."""
    topic = db.get(Topic, topic_id)
    if topic is None:
        return false()
    stems = _stems_by_topic().get(topic.name) or topic.keywords or [topic.name]
    terms = sorted({s.lower() for s in stems if s})
    # A stem in the title is a strong signal. In the abstract one stem alone is
    # noise ("a flood of content" pulled a VR-for-film project into Climate
    # adaptation), so the abstract must contain at least two different stems.
    return or_(*[Project.title.ilike(f"%{t}%") for t in terms],
               *[and_(Project.abstract.ilike(f"%{a}%"), Project.abstract.ilike(f"%{b}%"))
                 for a, b in combinations(terms, 2)])
