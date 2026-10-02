"""Read the coauthor / project split of a CollaborationEdge.

The ETL writes one edge per institution pair: `weight` is the combined value
(co-authored works + 0.5 per shared EU project), and coauthor_weight /
project_weight are the true counts behind it. Rows written before the split
existed have 0/0 with weight > 0: the split is unknown and callers fall back to
the old "tie strength" reading of `weight` + `type`.
"""


def edge_split(e) -> tuple[float, float, bool]:
    """Return (coauthor, project, known) for one edge.

    known=True: coauthor = co-authored works, project = shared EU projects.
    known=False: legacy row, the whole weight lands on the edge's type
    (a strength, not a count).
    """
    works = e.coauthor_weight or 0.0
    projects = e.project_weight or 0.0
    if works + projects > 0:
        return works, projects, True
    w = e.weight or 0.0
    if e.type == "coauthor":
        return w, 0.0, False
    if e.type == "project":
        return 0.0, w, False
    return 0.0, 0.0, False
