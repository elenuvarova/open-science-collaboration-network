"""Which stored CORDIS projects belong to a topic.

The project table is shared by all topics (the ETL adds each topic's
keyword-matched projects), and nothing records which topic pulled a project in.
We re-apply the ETL's own CORDIS keyword stems from etl/config.py, so "projects
on this topic" means the same thing here as in the pipeline. The stems are read
from the ETL config file (it ships in the image at /app/etl) to keep one source.
"""
import importlib.util
import os
import threading
import time
from functools import lru_cache
from itertools import combinations

from sqlalchemy import and_, false, or_

from models import Project, ProjectParticipant, Topic

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


# The clause is ~80 ILIKEs over long abstracts. Run it once per topic and keep
# the matching ids for 6 h (the data changes weekly), so a profile panel only
# intersects small sets instead of re-scanning abstracts on every request.
_ON_TOPIC_TTL = 6 * 3600
_on_topic: dict[tuple[int, int], tuple[float, frozenset]] = {}
_on_topic_lock = threading.Lock()


def on_topic_project_ids(db, topic_id: int) -> frozenset:
    key = (id(db.get_bind()), topic_id)
    hit = _on_topic.get(key)
    if hit and time.monotonic() - hit[0] < _ON_TOPIC_TTL:
        return hit[1]
    with _on_topic_lock:  # one cold computation per topic, not one per request
        hit = _on_topic.get(key)
        if hit and time.monotonic() - hit[0] < _ON_TOPIC_TTL:
            return hit[1]
        ids = frozenset(pid for (pid,) in db.query(Project.id).filter(topic_project_clause(db, topic_id)))
        _on_topic[key] = (time.monotonic(), ids)
        return ids


def clear_on_topic_cache() -> None:
    _on_topic.clear()


def institution_on_topic(db, topic_id: int, institution_id: int):
    """SQL condition on Project.id: this institution's projects on the topic."""
    mine = {pid for (pid,) in db.query(ProjectParticipant.project_id)
            .filter(ProjectParticipant.institution_id == institution_id).distinct()}
    ids = sorted(mine & on_topic_project_ids(db, topic_id))
    return Project.id.in_(ids) if ids else false()
