import { useEffect, useState } from "react";
import { getGraph } from "../api";
import GraphCanvas from "../components/GraphCanvas";
import InstitutionProfile from "./InstitutionProfile";
import EmptyState from "../components/EmptyState";

export default function NetworkMap({ topicId }) {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(80);
  const [type, setType] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!topicId) return;
    setLoading(true);
    setSelected(null);
    const params = { topic: topicId, limit };
    if (type) params.type = type;
    getGraph(params).then(setGraph).finally(() => setLoading(false));
  }, [topicId, limit, type]);

  return (
    <div className="graph-wrap">
      <div className="graph-canvas">
        {loading
          ? <div className="spinner">Building graph…</div>
          : graph.nodes.length === 0
            ? <EmptyState icon="🕸️" title="No graph data" body="Run the ETL to populate the collaboration network for this topic." />
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
            <select className="filter-select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value={50}>Top 50 nodes</option>
              <option value={80}>Top 80 nodes</option>
              <option value={150}>Top 150 nodes</option>
            </select>
            <select className="filter-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="university">Universities</option>
              <option value="company">Companies</option>
              <option value="public_body">Public bodies</option>
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
