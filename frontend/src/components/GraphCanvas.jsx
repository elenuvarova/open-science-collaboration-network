import { useEffect, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import GraphLegend from "./GraphLegend";
import GraphControls from "./GraphControls";

cytoscape.use(fcose);

const COMMUNITY_COLORS = [
  "#4f8ef7", "#4ade80", "#fbbf24", "#f87171", "#a78bfa",
  "#34d399", "#fb923c", "#e879f9", "#38bdf8", "#facc15",
];

function nodeColor(communityId) {
  return COMMUNITY_COLORS[(communityId ?? 0) % COMMUNITY_COLORS.length];
}

export default function GraphCanvas({ nodes, edges, onNodeClick }) {
  const cyRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Derive unique communities for legend
  const communities = [...new Map(
    nodes.map(n => [n.community_id, {
      id: n.community_id,
      color: nodeColor(n.community_id),
      label: `Cluster ${(n.community_id ?? 0) + 1}`,
    }])
  ).values()].slice(0, 8);

  const elements = [
    ...nodes.map((n) => ({
      data: {
        id: String(n.id),
        label: n.label,
        type: n.type,
        community: n.community_id ?? 0,
        centrality: n.centrality ?? 0,
        color: nodeColor(n.community_id),
        size: Math.max(18, Math.min(58, 18 + (n.centrality ?? 0) * 110)),
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
        "background-opacity": 0.9,
        color: "#f1f5f9",
        "font-size": 9,
        "text-valign": "bottom",
        "text-margin-y": 5,
        "text-max-width": 110,
        "text-wrap": "ellipsis",
        "border-width": 0,
        "text-background-color": "#0f1117",
        "text-background-opacity": 0.55,
        "text-background-padding": "2px",
        "text-background-shape": "round-rectangle",
        "transition-property": "background-opacity, border-width",
        "transition-duration": "150ms",
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": "#ffffff",
        "background-opacity": 1,
        "font-size": 10,
      },
    },
    {
      selector: "node:active",
      style: { "overlay-opacity": 0 },
    },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": "#2d3748",
        opacity: 0.4,
        "curve-style": "straight",
      },
    },
    {
      selector: 'edge[type="project"]',
      style: {
        "line-color": "#4f8ef755",
        "line-style": "dashed",
        "line-dash-pattern": [4, 3],
        opacity: 0.6,
      },
    },
    {
      selector: "edge:selected",
      style: { opacity: 1, width: 2, "line-color": "var(--accent)" },
    },
    {
      selector: ".dimmed",
      style: { opacity: 0.08 },
    },
    {
      selector: "node.hovered",
      style: {
        "background-opacity": 1,
        "border-width": 2,
        "border-color": "#ffffff55",
        "font-size": 10,
        opacity: 1,
      },
    },
  ];

  const layout = {
    name: "fcose",
    quality: "default",
    randomize: true,
    animate: true,
    animationDuration: 900,
    animationEasing: "ease-out",
    idealEdgeLength: 90,
    nodeRepulsion: 12000,
    gravity: 0.2,
    gravityRange: 3.8,
    numIter: 2500,
    tile: true,
    tilingPaddingVertical: 20,
    tilingPaddingHorizontal: 20,
  };

  useEffect(() => {
    if (!cyRef.current || !onNodeClick) return;
    const cy = cyRef.current;
    cy.removeAllListeners();

    cy.on("tap", "node", (e) => onNodeClick(e.target.data()));
    cy.on("tap", (e) => { if (e.target === cy) onNodeClick(null); });

    // Hover: highlight neighbours, fade the rest
    cy.on("mouseover", "node", (e) => {
      const node = e.target;
      const neighbours = node.closedNeighborhood();
      cy.elements().not(neighbours).addClass("dimmed");
      node.addClass("hovered");
    });
    cy.on("mouseout", "node", () => {
      cy.elements().removeClass("dimmed hovered");
    });
  }, [ready, onNodeClick]);

  if (!nodes.length) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
        No data for current filters
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <CytoscapeComponent
        elements={elements}
        stylesheet={stylesheet}
        layout={layout}
        style={{ width: "100%", height: "100%" }}
        cy={(cy) => { cyRef.current = cy; setReady(true); }}
      />
      <GraphLegend communities={communities} />
      <GraphControls cyRef={cyRef} />
    </div>
  );
}
