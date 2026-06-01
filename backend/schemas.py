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
