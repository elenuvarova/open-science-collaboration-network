"""Collaboration graph + network metrics (networkx).

Nodes = institutions. Edges = co-authorship (shared works) + project participation
(shared CORDIS projects). Computes degree + betweenness centrality and Louvain
communities (clusters). These power node sizing + cluster coloring in the UI.

TODO (Phase 2):
  - build nx.Graph from authorships (co-author edges) + project participants
  - nx.degree_centrality, nx.betweenness_centrality
  - community_louvain.best_partition for community_id
  - return per-institution metrics + edge list
"""
import networkx as nx  # noqa: F401  (used in Phase 2)


def build_graph(authorships, project_participants):
    """Return (edges, metrics_by_institution). STUB — Phase 2."""
    raise NotImplementedError("graph.build_graph — implement in Phase 2")
