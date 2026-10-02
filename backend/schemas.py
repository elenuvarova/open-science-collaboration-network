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
    coordinators_identified: int = 0
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
    # True counts; None when the split is unknown (rows from before the split existed).
    coauthor_works: Optional[int] = None
    shared_projects: Optional[int] = None


class EvidenceOut(BaseModel):
    institution_id: int
    topic_id: Optional[int] = None
    projects: list[EvidenceProject] = []
    totals: EvidenceTotals = EvidenceTotals()
    co_partners: list[CoPartner] = []
    # No works<->institution link exists in the schema yet, so this stays
    # unset and is dropped from the response (response_model_exclude_none).
    recent_works: Optional[list[WorkSearchResult]] = None


# --- Delivery record ----------------------------------------------------------
# Public outputs of the CORDIS projects an institution took part in. They belong
# to the projects, never to the partner on its own. CORDIS carries no open-access
# flag for publications, so there is no OA share.

class DeliveryTotals(BaseModel):
    deliverables: int = 0    # all types
    demonstrators: int = 0   # demonstrators, pilots, prototypes
    datasets: int = 0        # data sets, microdata
    reports: int = 0         # documents, reports
    other: int = 0           # plans, websites, patents, videos, ethics, unlabelled
    publications: int = 0


class DeliveryOut(BaseModel):
    institution_id: int
    topic_id: Optional[int] = None
    available: bool = False          # False until etl/outputs.py has filled project_output
    projects_total: int = 0          # the institution's projects (topic-scoped when topic is set)
    projects_with_outputs: int = 0   # of those, with at least one deliverable or publication on record
    totals: DeliveryTotals = DeliveryTotals()
    projects_with_demonstrator_or_dataset: int = 0
    demonstrator_or_dataset_share: Optional[float] = None  # 0-1 of projects_total; None without projects
    publications_per_project: Optional[float] = None       # per project of projects_total; None without projects
    updated_at: Optional[str] = None  # when the output counts were last refreshed (UTC ISO)


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


# --- Consortium ties ("who already works together") ---------------------------

class TieMember(BaseModel):
    id: int
    name: str
    country: Optional[str] = None
    type: Optional[str] = None


class TiePair(BaseModel):
    a: int  # smaller institution id of the pair
    b: int  # larger institution id of the pair
    # split_known=True: coauthor = co-authored works, project = shared EU projects
    # (true counts). False (legacy rows): strengths, a coauthor strength may include
    # shared projects.
    coauthor: float = 0.0
    project: float = 0.0
    weight: float = 0.0    # combined tie strength: works + 0.5 per shared project
    split_known: bool = False


class BridgeLink(BaseModel):
    member_id: int
    weight: float = 0.0  # summed edge weight between the bridge and that member


class TieBridge(BaseModel):
    id: int
    name: str
    country: Optional[str] = None
    type: Optional[str] = None
    partner_fit_score: float = 0.0
    eu_projects: int = 0
    connects: list[BridgeLink] = []  # consortium members it is tied to, strongest first


class TiesOut(BaseModel):
    topic_id: int
    members: list[TieMember] = []  # requested ids that exist, ascending id
    pairs: list[TiePair] = []      # only pairs with a recorded tie, strongest first
    isolated: list[int] = []       # members with no tie to any other member
    weak: list[int] = []           # tied, but total tie weight below the weak threshold
    bridges: list[TieBridge] = []  # up to 5 outside institutions, best first


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
