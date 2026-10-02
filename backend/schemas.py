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


class CallOut(BaseModel):
    identifier: str                      # e.g. HORIZON-CL5-2027-01-D1-10
    title: str
    type_of_action: Optional[str] = None  # RIA | IA | CSA | COFUND | PCP | …
    status: str                          # open | forthcoming
    deadlines: list[str] = []            # ISO dates still ahead, earliest first
    next_deadline: Optional[str] = None
    days_left: Optional[int] = None
    budget_eur: Optional[float] = None   # total indicative budget of this topic
    max_contribution_eur: Optional[float] = None  # EU contribution per project (upper bound)
    expected_grants: Optional[int] = None
    call_identifier: Optional[str] = None
    call_title: Optional[str] = None
    url: str                             # Funding & Tenders Portal topic page
    match_score: float = 0.0             # 0..1 fit with the requested noda topic


class CallsOut(BaseModel):
    topic_id: int
    calls: list[CallOut]
    fetched_at: Optional[str] = None     # when the portal was last read (UTC ISO)
    stale: bool = False                  # True when serving an expired cache (or nothing) because the portal is unreachable
