"""Tests for etl/outputs.py (the delivery-record ingest): aggregation of the CORDIS
deliverables/publications CSVs and the idempotent upsert. Local zips built on the
fly; no network. Run from backend/:  python -m pytest tests
"""
import io
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "etl"))
os.environ.setdefault("SQLITE_PATH", ":memory:")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import load
import outputs
from db import Base
from models import Project, ProjectOutput

DELIV_HEADER = "deliverableType;description;url;projectID;projectAcronym;contentUpdateDate;rcn;collection"
PUB_HEADER = ("id;title;isPublishedAs;authors;journalNumber;journalTitle;publishedPages;publishedYear;"
              "publisher;issn;isbn;doi;projectID;projectAcronym;collection;contentUpdateDate;rcn")


def _zip(tmp_path, name, member, text) -> str:
    path = tmp_path / name
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(member, "﻿" + text)  # CORDIS files start with a BOM
    return str(path)


def _deliverables(tmp_path):
    rows = [
        DELIV_HEADER,
        "Documents, reports;Report A;http://x/1;101;ALPHA;2023-01-01 00:00:00;1;Project deliverable",
        "Documents, reports;Report B;http://x/2;101;ALPHA;2023-01-01 00:00:00;2;Project deliverable",
        "Demonstrators, pilots, prototypes;Pilot;http://x/3;101;ALPHA;2023-01-01 00:00:00;3;Project deliverable",
        "Data sets, microdata, etc;Data;http://x/4;102;BETA;2023-01-01 00:00:00;4;Project deliverable",
        "Data Management Plan;DMP;http://x/5;102;BETA;2023-01-01 00:00:00;5;Project deliverable",
        "Websites, patent fillings, videos etc.;Site;http://x/6;102;BETA;2023-01-01 00:00:00;6;Project deliverable",
        ";No label;http://x/7;102;BETA;2023-01-01 00:00:00;7;Project deliverable",
        # a raw ";" inside the description pushes projectID to the right: still project 103
        "Documents, reports;Report; with a semicolon; and another;http://x/8;103;GAMMA;2023-01-01 00:00:00;8;Project deliverable",
        # a project that is not in our DB
        "Documents, reports;Elsewhere;http://x/9;999;OMEGA;2023-01-01 00:00:00;9;Project deliverable",
        # garbage row: projectID is not a number -> skipped, never guessed
        "Documents, reports;Broken;http://x/10;not-an-id;ZETA;2023-01-01 00:00:00;10;Project deliverable",
    ]
    return _zip(tmp_path, "d.zip", "projectDeliverables.csv", "\n".join(rows) + "\n")


def _publications(tmp_path):
    rows = [
        PUB_HEADER,
        "101_1_P;T1;Peer reviewed articles;A B;1;J;1-2;2023;Pub;1111-1111;;10.1/a;101;ALPHA;Project publication;2023-01-01 00:00:00;1",
        "101_2_P;T2;Conference proceedings;A B;1;J;1-2;2023;Pub;;;10.1/b;101;ALPHA;Project publication;2023-01-01 00:00:00;2",
        "104_1_P;T3;Peer reviewed articles;A B;1;J;1-2;2023;Pub;;;10.1/c;104;DELTA;Project publication;2023-01-01 00:00:00;3",
        # one field short (a known CORDIS quirk): projectID is still readable from the end
        "104_2_P;T4;Peer reviewed articles;A B;J;1-2;2023;Pub;;;10.1/d;104;DELTA;Project publication;2023-01-01 00:00:00;4",
        "999_1_P;T5;Peer reviewed articles;A B;1;J;1-2;2023;Pub;;;10.1/e;999;OMEGA;Project publication;2023-01-01 00:00:00;5",
    ]
    return _zip(tmp_path, "p.zip", "projectPublications.csv", "\n".join(rows) + "\n")


def test_aggregate_counts_types_and_publications(tmp_path):
    counts, stats = outputs.aggregate_programme(_deliverables(tmp_path), _publications(tmp_path), wanted={"101", "102", "103", "104", "105"})
    assert counts["101"] == {"deliverables": 3, "demonstrators": 1, "datasets": 0, "reports": 2, "other": 0, "publications": 2}
    # DMP, website and the unlabelled row are all "other"; deliverables is every type
    assert counts["102"] == {"deliverables": 4, "demonstrators": 0, "datasets": 1, "reports": 0, "other": 3, "publications": 0}
    assert counts["103"]["reports"] == 1 and counts["103"]["deliverables"] == 1   # shifted row recovered
    assert counts["104"] == {"deliverables": 0, "demonstrators": 0, "datasets": 0, "reports": 0, "other": 0, "publications": 2}
    assert "105" not in counts and "999" not in counts   # only wanted ids, nothing invented
    assert stats == {"deliverable_rows": 10, "publication_rows": 5, "skipped_rows": 1}


def test_aggregate_without_filter_keeps_every_project(tmp_path):
    counts, _ = outputs.aggregate_programme(_deliverables(tmp_path), _publications(tmp_path))
    assert "999" in counts and "not-an-id" not in counts


def test_bucket_and_id_normalisation():
    assert outputs._bucket("Data sets, microdata, etc") == "datasets"
    assert outputs._bucket("Data sets, microdata") == "datasets"      # tolerant of the label's suffix
    assert outputs._bucket("Data Management Plan") == "other"
    assert outputs._bucket("Open Research Data Pilot") == "other"
    assert outputs._bucket(None) == "other"
    assert outputs._norm_id(" 101069359 ") == "101069359"
    assert outputs._norm_id("883285.0") == "883285"                   # a float-typed id column


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    db.add_all([Project(id=1, cordis_id="101", title="A"), Project(id=2, cordis_id="102", title="B")])
    db.commit()
    yield db
    db.close()


def _row(project_id, deliverables, stamp):
    return {"project_id": project_id, "deliverables": deliverables, "demonstrators": 1, "datasets": 0,
            "reports": 0, "other": 0, "publications": 3, "updated_at": stamp}


def test_upsert_is_idempotent_and_updates_in_place(session):
    # Uses the real dialect-specific ON CONFLICT writer (SQLite here).
    load.bulk_upsert_project_outputs(session, [_row(1, 5, "t1"), _row(2, 7, "t1")])
    session.commit()
    load.bulk_upsert_project_outputs(session, [_row(1, 5, "t2"), _row(2, 9, "t2")])   # second run, one count changed
    session.commit()
    rows = {r.project_id: r for r in session.query(ProjectOutput).all()}
    assert len(rows) == 2                                   # still one row per project
    assert rows[1].deliverables == 5 and rows[2].deliverables == 9
    assert rows[1].updated_at == "t2"
    load.bulk_upsert_project_outputs(session, [])           # empty input is a no-op
