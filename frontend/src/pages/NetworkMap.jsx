import { useEffect, useMemo, useState } from "react";
import { getGraph } from "../api";
import GraphCanvas, { MAX_EDGES, visibleGraph } from "../components/GraphCanvas";
import InstitutionProfile from "./InstitutionProfile";
import EmptyState from "../components/EmptyState";

export default function NetworkMap({ topicId }) {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [limit, setLimit] = useState(80);
  const [type, setType] = useState("");
  const [selected, setSelected] = useState(null);
  const shown = useMemo(() => visibleGraph(graph.nodes, graph.edges), [graph]);

  useEffect(() => {
    if (!topicId) return;
    setLoading(true);
    setError(false);
    setSelected(null);
    const params = { topic: topicId, limit };
    if (type) params.type = type;
    let cancelled = false;
    getGraph(params)
      .then((d) => { if (!cancelled) setGraph(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId, limit, type, reloadKey]);

  return (
    <div className="graph-wrap">
      <div className="graph-canvas">
        {loading
          ? <div className="spinner" role="status" aria-live="polite">Building graph…</div>
          : error
            ? <EmptyState
                icon="alert"
                role="alert"
                title="Couldn’t load the network"
                body="The server didn’t respond — it may be waking up. Give it a moment and try again."
                action={<button className="btn btn-primary btn-sm" onClick={() => setReloadKey(k => k + 1)}>Retry</button>}
              />
            : graph.nodes.length === 0
            ? <EmptyState icon="network-node" role="status" title="No collaboration data yet" body="There’s no network to show for this topic yet. Check back shortly." />
            : <GraphCanvas
                nodes={graph.nodes}
                edges={graph.edges}
                onNodeClick={(data) => setSelected(data ? Number(data.id) : null)}
              />
        }
      </div>

      <div className="graph-sidebar">
        <div className="card">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", marginBottom: "var(--sp-3)" }}>
            <select className="filter-select" aria-label="Number of nodes" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value={50}>Top 50 nodes</option>
              <option value={80}>Top 80 nodes</option>
              <option value={150}>Top 150 nodes</option>
            </select>
            <select className="filter-select" aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="education">Education</option>
              <option value="company">Companies</option>
              <option value="government">Government</option>
              <option value="nonprofit">NGO / nonprofit</option>
              <option value="healthcare">Healthcare</option>
            </select>
          </div>
          <p className="graph-meta">
            {shown.nodes.length} linked institutions shown
            {shown.hidden > 0 && <> · {shown.hidden} without a link in this view hidden</>}
            <br />
            {graph.edges.length > MAX_EDGES
              ? `The ${MAX_EDGES} strongest of ${graph.edges.length.toLocaleString("en-GB")} links`
              : `${graph.edges.length} links`}
          </p>
        </div>

        {selected
          ? <InstitutionProfile id={selected} topicId={topicId} onBack={() => setSelected(null)} />
          : (
            <div className="card">
              <p className="graph-meta">
                Click a node to see the institution profile and Partner Fit Score breakdown. Zoom in with +/− or a pinch to
                read the smaller labels.
              </p>
            </div>
          )
        }
      </div>
    </div>
  );
}
