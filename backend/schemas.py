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


# --- Partner evidence + suggestions -----------------------------------------

class EvidenceProject(BaseModel):
    id: int
    title: str
    programme: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    role: str  # coordinator | participant
    ec_contribution: Optional[float] = None  # whole-project EC funding, EUR


class EvidenceTotals(BaseModel):
    projects: int = 0
    coordinator: int = 0
    ec_contribution: float = 0.0  # summed over the institution's projects


class CoPartner(BaseModel):
    id: int
    name: str
    country: Optional[str] = None
    type: Optional[str] = None
    edge_types: list[str] = []  # subset of coauthor | project
    weight: float = 0.0


class EvidenceOut(BaseModel):
    institution_id: int
    topic_id: Optional[int] = None
    projects: list[EvidenceProject] = []
    totals: EvidenceTotals = EvidenceTotals()
    co_partners: list[CoPartner] = []
    # No works<->institution link exists in the schema yet, so this stays
    # unset and is dropped from the response (response_model_exclude_none).
    recent_works: Optional[list[WorkSearchResult]] = None


class SuggestionOut(BaseModel):
    id: int
    name: str
    country: Optional[str] = None
    type: Optional[str] = None
    partner_fit_score: float = 0.0
    eu_projects: int = 0
    score: float = 0.0  # blended rank score, 0-100
    linked_partners: int = 0  # how many consortium members it is connected to
    why: str = ""
