import Icon from "./Icon";

// Zoom steps about the canvas centre (cy.zoom(level) alone zooms about the
// top-left corner, so the graph slid away with every click).
function zoomBy(cy, factor) {
  if (!cy) return;
  cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
}

export default function GraphControls({ cyRef, onFit }) {
  const btn = (label, title, onClick) => (
    <button className="graph-zoom-btn" title={title} aria-label={title} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div style={{
      position: "absolute", top: "var(--sp-3)", right: "var(--sp-3)",
      display: "flex", flexDirection: "column", gap: "var(--sp-1)",
      zIndex: "var(--z-overlay)",
    }}>
      {btn(<Icon name="zoom-in" size={16} />, "Zoom in",  () => zoomBy(cyRef.current, 1.3))}
      {btn(<Icon name="zoom-out" size={16} />, "Zoom out", () => zoomBy(cyRef.current, 1 / 1.3))}
      {btn(<Icon name="zoom-fit" size={16} />, "Fit view", () => onFit?.())}
    </div>
  );
}
