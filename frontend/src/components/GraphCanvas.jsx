import { useEffect, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

cytoscape.use(fcose);

const COMMUNITY_COLORS = [
  "#4f8ef7", "#4ade80", "#fbbf24", "#f87171", "#a78bfa",
  "#34d399", "#fb923c", "#e879f9", "#38bdf8", "#facc15",
];

function nodeColor(communityId) {
  return COMMUNITY_COLORS[(communityId ?? 0) % COMMUNITY_COLORS.length];
}

export default function GraphCanvas({ nodes, edges, onNodeClick }) {
  const [ready, setReady] = useState(false);
  const cyRef = useRef(null);

  const elements = [
    ...nodes.map((n) => ({
      data: {
        id: String(n.id),
        label: n.label,
        type: n.type,
        community: n.community_id ?? 0,
        centrality: n.centrality ?? 0,
        color: nodeColor(n.community_id),
        size: Math.max(18, Math.min(60, 18 + (n.centrality ?? 0) * 120)),
      },
    })),
    ...edges.map((e, i) => ({
      data: {
        id: `e${i}`,
        source: String(e.source),
        target: String(e.target),
        type: e.type,
        weight: e.weight,
      },
    })),
  ];

  const stylesheet = [
    {
      selector: "node",
      style: {
        label: "data(label)",
        width: "data(size)",
        height: "data(size)",
        "background-color": "data(color)",
        color: "#e2e8f0",
        "font-size": 9,
        "text-valign": "bottom",
        "text-margin-y": 4,
        "text-max-width": 100,
        "text-wrap": "ellipsis",
        "border-width": 0,
        "text-background-color": "#0f1117",
        "text-background-opacity": 0.6,
        "text-background-padding": "2px",
        "text-background-shape": "round-rectangle",
      },
    },
    {
      selector: "node:selected",
      style: { "border-width": 2, "border-color": "#ffffff" },
    },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": "#2d3748",
        opacity: 0.5,
        "curve-style": "straight",
      },
    },
    {
      selector: 'edge[type="project"]',
      style: { "line-color": "#4f8ef755", "line-style": "dashed" },
    },
  ];

  const layout = {
    name: "fcose",
    quality: "proof",
    randomize: true,
    animate: false,
    idealEdgeLength: 60,
    nodeRepulsion: 4500,
    numIter: 2500,
    tile: true,
  };

  useEffect(() => {
    if (cyRef.current && onNodeClick) {
      const cy = cyRef.current;
      cy.removeAllListeners();
      cy.on("tap", "node", (e) => onNodeClick(e.target.data()));
    }
  }, [ready, onNodeClick]);

  if (!nodes.length) return <div className="spinner">No data for current filters</div>;

  return (
    <CytoscapeComponent
      elements={elements}
      stylesheet={stylesheet}
      layout={layout}
      style={{ width: "100%", height: "100%" }}
      cy={(cy) => { cyRef.current = cy; setReady(true); }}
    />
  );
}
