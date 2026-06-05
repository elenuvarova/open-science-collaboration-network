import { useEffect, useState } from "react";
import { getGraph } from "../api";
import GraphCanvas from "../components/GraphCanvas";
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
          ? <div className="spinner">Building graph…</div>
          : error
            ? <EmptyState
                icon="⚠️"
                title="Couldn’t load the network"
                body="The server didn’t respond — it may be waking up. Give it a moment and try again."
                action={<button className="btn btn-primary btn-sm" onClick={() => setReloadKey(k => k + 1)}>Retry</button>}
              />
            : graph.nodes.length === 0
            ? <EmptyState icon="🕸️" title="No collaboration data yet" body="There’s no network to show for this topic yet. Check back shortly." />
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
          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", lineHeight: "var(--leading-relaxed)" }}>
            {graph.nodes.length} nodes · {graph.edges.length} edges
          </p>
        </div>

        {selected
          ? <InstitutionProfile id={selected} topicId={topicId} onBack={() => setSelected(null)} />
          : (
            <div className="card">
              <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", lineHeight: "var(--leading-relaxed)" }}>
                Click a node to see the institution profile and Partner Fit Score breakdown. Use +/− or pinch to zoom.
              </p>
            </div>
          )
        }
      </div>
    </div>
  );
}
