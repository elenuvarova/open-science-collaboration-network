export default function GraphControls({ cyRef }) {
  const btn = (label, title, onClick) => (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
        color: "var(--text-2)", cursor: "pointer", fontSize: "var(--text-base)",
        transition: "background var(--transition)",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
      onMouseLeave={e => e.currentTarget.style.background = "var(--surface)"}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      position: "absolute", top: "var(--sp-3)", right: "var(--sp-3)",
      display: "flex", flexDirection: "column", gap: "var(--sp-1)",
      zIndex: 10,
    }}>
      {btn("+", "Zoom in",  () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3))}
      {btn("−", "Zoom out", () => cyRef.current?.zoom(cyRef.current.zoom() * 0.77))}
      {btn("⊡", "Fit view", () => cyRef.current?.fit(undefined, 24))}
    </div>
  );
}
