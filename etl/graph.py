"""Collaboration graph + network metrics.

Nodes = institutions. Edges:
  - coauthor: two institutions appear together in a work's authorships
  - project:  two institutions appear together in a CORDIS project

Computes degree + betweenness centrality and Louvain community detection.
"""
from collections import defaultdict

import community as community_louvain
import networkx as nx


def build_graph(
    authorships_by_work: list[list[str]],  # [[inst_id, inst_id, ...], ...]
    project_participants: list[list[str]],  # [[inst_id, inst_id, ...], ...]
) -> tuple[nx.Graph, dict]:
    """Return (graph, metrics_by_institution_id).

    metrics: {inst_id: {degree_centrality, betweenness, community_id}}
    """
    G = nx.Graph()

    coauthor_weights: dict = defaultdict(float)
    for inst_ids in authorships_by_work:
        uniq = list(set(inst_ids))
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                a, b = min(uniq[i], uniq[j]), max(uniq[i], uniq[j])
                coauthor_weights[(a, b)] += 1.0

    project_weights: dict = defaultdict(float)
    for inst_ids in project_participants:
        uniq = list(set(inst_ids))
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                a, b = min(uniq[i], uniq[j]), max(uniq[i], uniq[j])
                project_weights[(a, b)] += 1.0

    # One edge per pair. `weight` stays the combined value (centrality/layout);
    # coauthor_weight / project_weight keep the two components as true counts so
    # the UI can tell "N co-authored works" from "M shared projects".
    #   co-authored pair:  type="coauthor", weight = works + 0.5 * projects
    #   project-only pair: type="project",  weight = projects
    for pair in sorted(set(coauthor_weights) | set(project_weights)):
        works = coauthor_weights.get(pair, 0.0)
        projects = project_weights.get(pair, 0.0)
        if works:
            G.add_edge(*pair, type="coauthor", weight=works + projects * 0.5,
                       coauthor_weight=works, project_weight=projects)
        else:
            G.add_edge(*pair, type="project", weight=projects,
                       coauthor_weight=0.0, project_weight=projects)

    if len(G.nodes) == 0:
        return G, {}

    degree = nx.degree_centrality(G)
    # Betweenness is expensive on large graphs — use approximate (k samples)
    k = min(100, len(G.nodes))
    betweenness = nx.betweenness_centrality(G, k=k, normalized=True)
    partition = community_louvain.best_partition(G)

    metrics = {
        node: {
            "degree_centrality": round(degree.get(node, 0.0), 6),
            "betweenness": round(betweenness.get(node, 0.0), 6),
            "community_id": partition.get(node, 0),
        }
        for node in G.nodes
    }
    return G, metrics
