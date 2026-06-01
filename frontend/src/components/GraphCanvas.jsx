import { useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import cola from "cytoscape-cola";
import GraphLegend from "./GraphLegend";
import GraphControls from "./GraphControls";

cytoscape.use(fcose);
cytoscape.use(cola);

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

  // Limit to strongest edges so the layout isn't pulled into a hairball
  const topEdges = [...edges].sort((a, b) => b.weight - a.weight).slice(0, 280);

  const elements = [
    ...nodes.map((n) => ({
      data: {
        id: String(n.id),
        label: n.label,
        type: n.type,
        community: n.community_id ?? 0,
        centrality: n.centrality ?? 0,
        color: nodeColor(n.community_id),
        size: Math.max(14, Math.min(38, 14 + (n.centrality ?? 0) * 80)),
      },
    })),
    ...topEdges.map((e, i) => ({
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
        "background-opacity": 0.88,
        color: "#f1f5f9",
        "font-size": 8,
        "text-valign": "bottom",
        "text-margin-y": 4,
        "text-max-width": 90,
        "text-wrap": "ellipsis",
        "border-width": 0,
        "text-background-color": "#0f1117",
        "text-background-opacity": 0.6,
        "text-background-padding": "2px",
        "text-background-shape": "round-rectangle",
        "transition-property": "background-opacity, border-width, opacity",
        "transition-duration": "180ms",
        "min-zoomed-font-size": 6,
      },
    },
    {
      selector: "node[size < 20]",
      style: { label: "" },
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

  // CytoscapeComponent runs its `layout` prop on every render; keep it a no-op
  // "preset" so positions are never re-frozen. The real layout is the live cola
  // force simulation started imperatively below.
  const layout = useMemo(() => ({ name: "preset" }), []);

  // Keep the latest onNodeClick without re-registering listeners every render.
  const onNodeClickRef = useRef(onNodeClick);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);

  // Live force simulation — runs continuously so nodes are draggable and their
  // neighbours respond to dragging, instead of a frozen one-shot layout. Node
  // counts are capped (≤150) so it stays light. Restarted on data change,
  // stopped on unmount.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !ready || !nodes.length) return;
    const sim = cy.layout({
      name: "cola",
      infinite: true,
      fit: false,
      centerGraph: true,
      animate: true,
      randomize: true,
      avoidOverlap: true,
      handleDisconnected: true,
      nodeSpacing: 8,
      edgeLength: 100,
    });
    sim.run();
    const fitT = setTimeout(() => cyRef.current?.fit(undefined, 30), 700);
    return () => { clearTimeout(fitT); sim.stop(); };
  }, [ready, nodes, edges]);

  // Interaction: tap to select, hover to highlight neighbours. Registered once
  // (no removeAllListeners — that would also strip cola's drag listeners).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !ready) return;
    const tapNode = (e) => onNodeClickRef.current?.(e.target.data());
    const tapBg = (e) => { if (e.target === cy) onNodeClickRef.current?.(null); };
    const over = (e) => {
      const node = e.target;
      cy.elements().not(node.closedNeighborhood()).addClass("dimmed");
      node.addClass("hovered");
    };
    const out = () => cy.elements().removeClass("dimmed hovered");
    cy.on("tap", "node", tapNode);
    cy.on("tap", tapBg);
    cy.on("mouseover", "node", over);
    cy.on("mouseout", "node", out);
    return () => {
      cy.off("tap", "node", tapNode);
      cy.off("tap", tapBg);
      cy.off("mouseover", "node", over);
      cy.off("mouseout", "node", out);
    };
  }, [ready]);

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
