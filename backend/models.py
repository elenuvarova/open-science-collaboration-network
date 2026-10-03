from sqlalchemy import (
    Boolean,
    JSON,
    Column,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from db import Base, db_kind


class Topic(Base):
    __tablename__ = "topic"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    keywords = Column(JSON, default=list)


class Institution(Base):
    __tablename__ = "institution"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    normalized_name = Column(String, index=True)
    country = Column(String, index=True)
    city = Column(String)
    type = Column(String)  # university | company | ngo | public_body
    openalex_id = Column(String, unique=True)
    ror_id = Column(String)
    cordis_pic = Column(String, nullable=True)
    match_confidence = Column(Float, nullable=True)

    metrics = relationship("InstitutionMetric", back_populates="institution")


class Author(Base):
    __tablename__ = "author"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    openalex_id = Column(String, unique=True)
    orcid = Column(String, nullable=True)
    institution_id = Column(Integer, ForeignKey("institution.id"))


class Work(Base):
    __tablename__ = "work"
    # A work relevant to several topics gets one row per topic (own embedding),
    # so openalex_id is unique only WITHIN a topic — not globally.
    __table_args__ = (
        UniqueConstraint("openalex_id", "topic_id", name="work_openalex_topic_key"),
    )
    id = Column(Integer, primary_key=True)
    openalex_id = Column(String, index=True)
    title = Column(Text)
    year = Column(Integer)
    abstract = Column(Text, nullable=True)
    doi = Column(String, nullable=True)
    cited_by_count = Column(Integer, default=0)
    topic_id = Column(Integer, ForeignKey("topic.id"), index=True)


class Project(Base):
    __tablename__ = "project"
    id = Column(Integer, primary_key=True)
    cordis_id = Column(String, unique=True)
    title = Column(Text)
    abstract = Column(Text, nullable=True)
    programme = Column(String)  # HORIZON | H2020 | FP7
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    ec_contribution = Column(Float, nullable=True)
    countries = Column(JSON, default=list)


class ProjectOutput(Base):
    """Public outputs CORDIS lists for a project (one row per project): counts of
    its deliverables by type plus its publications. They belong to the PROJECT,
    not to any one partner. Filled by etl/outputs.py; a project CORDIS lists no
    outputs for has no row. CORDIS's publications file carries no open-access
    flag, so there is no OA count."""
    __tablename__ = "project_output"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("project.id"), unique=True, nullable=False)
    deliverables = Column(Integer, default=0, nullable=False)   # all types
    demonstrators = Column(Integer, default=0, nullable=False)  # "Demonstrators, pilots, prototypes"
    datasets = Column(Integer, default=0, nullable=False)       # "Data sets, microdata, etc"
    reports = Column(Integer, default=0, nullable=False)        # "Documents, reports"
    other = Column(Integer, default=0, nullable=False)          # every other type (plans, websites, patents, ethics…)
    publications = Column(Integer, default=0, nullable=False)
    updated_at = Column(String)  # UTC ISO-8601, when etl/outputs.py last wrote the row


class ProjectParticipant(Base):
    __tablename__ = "project_participant"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("project.id"), index=True)
    institution_id = Column(Integer, ForeignKey("institution.id"), index=True)
    role = Column(String)  # coordinator | participant
    # Tag of the last full ETL run that matched this participation. A full run
    # deletes rows it did not see, so matches a stricter rule now rejects go away.
    seen_run = Column(String, nullable=True)


class CollaborationEdge(Base):
    __tablename__ = "collaboration_edge"
    id = Column(Integer, primary_key=True)
    source_institution_id = Column(Integer, ForeignKey("institution.id"), index=True)
    target_institution_id = Column(Integer, ForeignKey("institution.id"), index=True)
    topic_id = Column(Integer, ForeignKey("topic.id"), index=True)
    type = Column(String)  # coauthor | project
    weight = Column(Float, default=1.0)  # combined: coauthor works + 0.5 per shared project (centrality/layout)
    # Split behind `weight`, written by the ETL: co-authored works and shared EU
    # projects (true counts). 0/0 on rows written before the split existed.
    coauthor_weight = Column(Float, default=0)
    project_weight = Column(Float, default=0)


class InstitutionMetric(Base):
    __tablename__ = "institution_metric"
    id = Column(Integer, primary_key=True)
    institution_id = Column(Integer, ForeignKey("institution.id"), index=True)
    topic_id = Column(Integer, ForeignKey("topic.id"), index=True)
    degree_centrality = Column(Float, default=0.0)
    betweenness = Column(Float, default=0.0)
    community_id = Column(Integer, nullable=True)
    partner_fit_score = Column(Float, default=0.0)
    score_breakdown = Column(JSON, default=dict)
    recent_works = Column(Integer, default=0)
    eu_projects = Column(Integer, default=0)

    institution = relationship("Institution", back_populates="metrics")


class WorkEmbedding(Base):
    """384-dim all-MiniLM-L6-v2 embedding for a work abstract, stored as JSON array."""
    __tablename__ = "work_embedding"
    id = Column(Integer, primary_key=True)
    work_id = Column(Integer, ForeignKey("work.id"), unique=True, index=True)
    embedding = Column(JSON, nullable=False)


class TopicBrief(Base):
    """AI-generated strategy brief for a topic (batch-generated by ETL via Groq)."""
    __tablename__ = "topic_brief"
    id = Column(Integer, primary_key=True)
    topic_id = Column(Integer, ForeignKey("topic.id"), unique=True, index=True)
    text = Column(Text, nullable=False)
    generated_at = Column(String)
    model = Column(String)


class EtlRun(Base):
    """One row per scheduled ETL run, so the UI can state when the data was last
    refreshed (and an operator can see failed runs without the container logs)."""
    __tablename__ = "etl_run"
    id = Column(Integer, primary_key=True)
    reason = Column(String)
    started_at = Column(String)   # UTC ISO-8601
    finished_at = Column(String, nullable=True)
    ok = Column(Boolean, default=False)
    exit_code = Column(Integer, nullable=True)


class CallsSnapshot(Base):
    """The last good fetch of Horizon Europe calls (one row, id 1). A restart
    reads it instead of hitting the EU portal again, and a portal outage or
    block serves it, flagged stale, instead of an empty Calls page."""
    __tablename__ = "calls_snapshot"
    id = Column(Integer, primary_key=True)
    fetched_at = Column(Float)  # unix time of the fetch
    payload = Column(JSON)      # the parsed calls, without embedding vectors
