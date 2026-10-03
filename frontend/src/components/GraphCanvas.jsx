import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import cola from "cytoscape-cola";
import GraphLegend from "./GraphLegend";
import GraphControls from "./GraphControls";
import { nodeColor } from "./communityColors";

cytoscape.use(fcose);
cytoscape.use(cola);

// What the canvas actually draws: the strongest links (so the layout isn't a
// hairball) and only institutions with at least one of them. Unlinked nodes used
// to sit in a column of their own and stretched the fit until every label was
// ~5 px; NetworkMap reports how many are left out.
export const MAX_EDGES = 280;
const LABELLED = 18;
export function visibleGraph(nodes, edges) {
  const topEdges = [...edges].sort((a, b) => b.weight - a.weight).slice(0, MAX_EDGES);
  const linked = new Set();
  for (const e of topEdges) { linked.add(e.source); linked.add(e.target); }
  const shown = nodes.filter((n) => linked.has(n.id));
  return { nodes: shown, edges: topEdges, hidden: nodes.length - shown.length };
}

export default function GraphCanvas({ nodes: allNodes, edges: allEdges, onNodeClick }) {
  const { nodes, edges: topEdges } = useMemo(() => visibleGraph(allNodes, allEdges), [allNodes, allEdges]);
  const cyRef = useRef(null);
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  // On a phone-width canvas fewer, larger labels: the fit zoom there is ~0.5.
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  // Fit the graph into the canvas minus an open legend, so the legend never sits
  // on top of nodes (cy.fit only knows a uniform padding).
  const fitGraph = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || !cy.elements().length) return;
    const pad = 28;
    const legend = containerRef.current?.querySelector(".graph-legend");
    const lw = legend && legend.dataset.open === "true" && cy.width() > 640 ? legend.offsetWidth + 12 : 0;
    const bb = cy.elements().boundingBox();
    const availW = cy.width() - lw - pad * 2;
    const availH = cy.height() - pad * 2;
    if (availW <= 0 || availH <= 0 || !bb.w || !bb.h) return;
    const z = Math.min(availW / bb.w, availH / bb.h, cy.maxZoom());
    cy.viewport({
      zoom: z,
      pan: { x: lw + pad + (availW - bb.w * z) / 2 - bb.x1 * z, y: pad + (availH - bb.h * z) / 2 - bb.y1 * z },
    });
  }, []);

  // Resolve design tokens from CSS variables (cytoscape can't read var()).
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);
  const textColor = v("--text-1", "#12121e");
  const bgColor = v("--bg", "#e5e4ea");
  const borderColor = v("--border", "#cfced9");
  // Project edges use the accent. Cytoscape rejects 8-digit hex (#rrggbbaa) and
  // silently drops the rule, so transparency goes through line-opacity instead.
  const accentColor = v("--accent", "#1257b8");
  const projectEdgeColor = accentColor;
  const pairColor = v("--pair", "#e0261b");

  // Derive unique communities for legend
  const communities = [...new Map(
    nodes.map(n => [n.community_id, {
      id: n.community_id,
      color: nodeColor(n.community_id),
      label: `Cluster ${(n.community_id ?? 0) + 1}`,
    }])
  ).values()].slice(0, 8);


  // Permanent labels only for the most central institutions; the rest show theirs
  // on hover or selection. Labelling all of them made the names collide.
  const rankOf = new Map([...nodes].sort((a, b) => (b.centrality ?? 0) - (a.centrality ?? 0)).map((n, i) => [n.id, i]));

  const elements = [
    ...nodes.map((n) => ({
      data: {
        rank: rankOf.get(n.id),
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
        color: textColor,
        // Readable labels: 12 px at 1:1. When the view is zoomed out so far that
        // a label would render under 10 px it is hidden instead (zoom in to see
        // it): a smudge of 5 px text helps nobody.
        "font-size": narrow ? 20 : 12,
        "font-family": "Outfit, system-ui, sans-serif",
        "text-valign": "bottom",
        "text-margin-y": 5,
        "text-max-width": narrow ? 280 : 150,
        "text-wrap": "ellipsis",
        "border-width": 1.5,
        "border-color": textColor,
        "text-background-color": bgColor,
        "text-background-opacity": 0.85,
        "text-background-padding": "2px",
        "text-background-shape": "round-rectangle",
        "transition-property": "background-opacity, border-width, opacity",
        // Node hover/select feedback — cytoscape parses this string itself and
        // can't read CSS var(), so it mirrors --dur (150ms) by hand.
        "transition-duration": "150ms",
        // Cytoscape compares this against the size in device pixels.
        "min-zoomed-font-size": 10 * dpr,
      },
    },
    {
      // Beyond the top LABELLED, labels appear on hover/selection (and in the
      // screen-reader list); showing every one at once only makes them collide.
      selector: `node[rank >= ${narrow ? 12 : LABELLED}]`,
      style: { label: "" },
    },
    {
      selector: "node:selected",
      style: {
        label: "data(label)",
        "border-width": 3,
        "border-color": textColor,
        "background-opacity": 1,
        "font-size": 14,
        "min-zoomed-font-size": 0,
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
        "line-color": borderColor,
        opacity: 0.4,
        "curve-style": "straight",
      },
    },
    {
      selector: 'edge[type="project"]',
      style: {
        "line-color": projectEdgeColor,
        "line-opacity": 0.55,
        "line-style": "dashed",
        "line-dash-pattern": [4, 3],
        opacity: 0.6,
      },
    },
    {
      selector: "edge:selected",
      style: { opacity: 1, width: 3, "line-color": pairColor },
    },
    {
      selector: ".dimmed",
      style: { opacity: 0.08 },
    },
    {
      selector: "node.hovered",
      style: {
        label: "data(label)",
        "background-opacity": 1,
        "border-width": 2,
        "border-color": textColor,
        "font-size": 14,
        "min-zoomed-font-size": 0,
        "z-index": 10,
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
    // Honour prefers-reduced-motion: run a one-shot settle instead of the
    // continuous force animation (WCAG 2.3.3). Drag still works after settling.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sim = cy.layout({
      name: "cola",
      infinite: !reduce,
      fit: false,
      centerGraph: true,
      animate: !reduce,
      randomize: true,
      avoidOverlap: true,
      handleDisconnected: true,
      nodeSpacing: 22,   // room for a label under each bead
      edgeLength: 110,   // tighter than before so the fit isn't zoomed out to nothing
    });
    sim.run();
    // The live simulation keeps spreading nodes for a few seconds, so one early
    // fit leaves the graph drifting off-canvas. Re-fit while it settles — but
    // stop as soon as the user pans, zooms or drags, so we never fight them.
    let userMoved = false;
    const markMoved = () => { userMoved = true; };
    cy.on("tapstart scrollzoom", markMoved);
    const fits = [700, 1600, 3000, 5000].map((ms) =>
      setTimeout(() => { if (!userMoved) fitGraph(); }, ms)
    );
    return () => { fits.forEach(clearTimeout); cy.off("tapstart scrollzoom", markMoved); sim.stop(); };
  }, [ready, nodes, topEdges, fitGraph]);

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

  // Keep the cytoscape canvas sized to its container. In the mobile stacked
  // layout the container starts at 0 height during the flex reflow, so cytoscape
  // captures a 0×0 canvas at init and the graph renders blank. A ResizeObserver
  // re-syncs the renderer (and re-fits) whenever the container gains/changes size.
  useEffect(() => {
    const cy = cyRef.current;
    const el = containerRef.current;
    if (!cy || !ready || !el || typeof ResizeObserver === "undefined") return;
    let fitT;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      cy.resize();
      clearTimeout(fitT);
      fitT = setTimeout(fitGraph, 120);
    });
    ro.observe(el);
    return () => { clearTimeout(fitT); ro.disconnect(); };
  }, [ready, fitGraph]);

  if (!nodes.length) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
        No data for current filters
      </div>
    );
  }

  // Keyboard/AT alternative — the canvas itself isn't navigable, so mirror each
  // node as a focusable button that opens the same profile. Capped to keep the
  // list short.
  const SR_CAP = 60;
  const srNodes = nodes.slice(0, SR_CAP);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Collaboration network"
      style={{ position: "absolute", inset: 0 }}
    >
      <div
        role="img"
        aria-label={`Collaboration network: ${nodes.length} institutions across ${communities.length} clusters`}
        style={{ position: "absolute", inset: 0 }}
      >
        <CytoscapeComponent
          elements={elements}
          stylesheet={stylesheet}
          layout={layout}
          style={{ width: "100%", height: "100%" }}
          cy={(cy) => { cyRef.current = cy; setReady(true); }}
        />
      </div>
      <ul className="sr-only-focusable">
        {srNodes.map((n) => (
          <li key={n.id}>
            <button onClick={() => onNodeClickRef.current?.({
              id: String(n.id),
              label: n.label,
              type: n.type,
              community: n.community_id ?? 0,
            })}>
              {n.label} — cluster {(n.community_id ?? 0) + 1}
            </button>
          </li>
        ))}
        {nodes.length > SR_CAP && (
          <li>{nodes.length - SR_CAP} more institutions not listed.</li>
        )}
      </ul>
      <GraphLegend communities={communities} onToggle={() => setTimeout(fitGraph, 0)} />
      <GraphControls cyRef={cyRef} onFit={fitGraph} />
    </div>
  );
}
