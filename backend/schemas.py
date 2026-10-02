from typing import Optional

from pydantic import BaseModel


class TopicOut(BaseModel):
    id: int
    name: str
    keywords: list = []

    class Config:
        from_attributes = True


class InstitutionOut(BaseModel):
    id: int
    name: str
    country: Optional[str] = None
    type: Optional[str] = None
    ror_id: Optional[str] = None

    class Config:
        from_attributes = True


class InstitutionScored(InstitutionOut):
    partner_fit_score: float = 0.0
    score_breakdown: dict = {}
    community_id: Optional[int] = None
    eu_projects: int = 0
    recent_works: int = 0


class GraphNode(BaseModel):
    id: int
    label: str
    type: str
    community_id: Optional[int] = None
    centrality: float = 0.0


class GraphEdge(BaseModel):
    source: int
    target: int
    type: str
    weight: float = 1.0


class GraphOut(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class BriefOut(BaseModel):
    topic_id: int
    text: str
    generated_at: Optional[str] = None
    model: Optional[str] = None


class WorkSearchResult(BaseModel):
    id: int
    title: str
    year: Optional[int] = None
    doi: Optional[str] = None
    cited_by_count: int = 0
    abstract_snippet: str = ""
    similarity: float = 0.0


class MetaOut(BaseModel):
    data_as_of: Optional[str] = None
    topics: int = 0
    institutions: int = 0
    scores: int = 0
    edges: int = 0
    works: int = 0
    projects: int = 0


class BenchmarkOut(BaseModel):
    topic_id: int
    projects: int = 0
    median_countries: Optional[float] = None
    p25_countries: Optional[float] = None
    p75_countries: Optional[float] = None
    programmes: dict = {}
    coordinator_types: dict = {}
