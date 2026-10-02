"""topic_project_clause: a stem in the title counts; in the abstract it takes two
different stems, so one stray word ("a flood of content") doesn't make a project
on-topic."""
from sqlalchemy.orm import sessionmaker

import main  # noqa: F401  (creates the tables)
from db import engine
from models import Project, Topic
from topic_match import topic_project_clause

Session = sessionmaker(bind=engine)


def test_title_or_two_abstract_stems():
    db = Session()
    db.add(Topic(id=901, name="tm-topic", keywords=["flood", "drought", "heat wave"]))
    db.add_all([
        Project(id=9001, cordis_id="tm1", title="Flood early warning", abstract="x"),
        Project(id=9002, cordis_id="tm2", title="VR for film", abstract="A flood of new content for viewers."),
        Project(id=9003, cordis_id="tm3", title="Resilient farms", abstract="Drought and flood risk on farms."),
        Project(id=9004, cordis_id="tm4", title="Batteries", abstract="Nothing related."),
    ])
    db.commit()
    ids = {p.id for p in db.query(Project).filter(Project.id >= 9001, topic_project_clause(db, 901))}
    db.close()
    assert ids == {9001, 9003}
