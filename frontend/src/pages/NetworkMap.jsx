import { useEffect, useState } from "react";
import { getGraph } from "../api";
import GraphCanvas from "../components/GraphCanvas";
import InstitutionProfile from "./InstitutionProfile";

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
          : <GraphCanvas
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeClick={(data) => setSelected(Number(data.id))}
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
          <p className="muted" style={{ fontSize: "var(--text-xs)", lineHeight: "var(--leading-relaxed)" }}>
            {graph.nodes.length} nodes · {graph.edges.length} edges<br />
            Size = centrality · Color = cluster
          </p>
        </div>

        {selected
          ? <InstitutionProfile id={selected} topicId={topicId} onBack={() => setSelected(null)} />
          : (
            <div className="card">
              <p className="muted" style={{ fontSize: "var(--text-xs)", lineHeight: "var(--leading-relaxed)" }}>
                Click a node to see the institution profile and Partner Fit Score breakdown.
              </p>
            </div>
          )
        }
      </div>
    </div>
  );
}
