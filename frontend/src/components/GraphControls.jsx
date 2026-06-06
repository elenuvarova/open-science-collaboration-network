export default function GraphControls({ cyRef }) {
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
      {btn("+", "Zoom in",  () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3))}
      {btn("−", "Zoom out", () => cyRef.current?.zoom(cyRef.current.zoom() * 0.77))}
      {btn("⊡", "Fit view", () => cyRef.current?.fit(undefined, 24))}
    </div>
  );
}
