const COLORS = [
  "#4f8ef7", "#4ade80", "#fbbf24", "#f87171", "#a78bfa",
  "#34d399", "#fb923c", "#e879f9", "#38bdf8", "#facc15",
];

export default function GraphLegend({ communities = [] }) {
  const items = communities.length
    ? communities.slice(0, 8)
    : COLORS.slice(0, 5).map((c, i) => ({ id: i, color: c, label: `Cluster ${i + 1}` }));

  return (
    <div style={{
      position: "absolute", bottom: "var(--sp-3)", left: "var(--sp-3)",
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--r-md)", padding: "var(--sp-3)",
      display: "flex", flexDirection: "column", gap: "var(--sp-1)",
      zIndex: 10, backdropFilter: "blur(4px)",
      maxWidth: 180,
    }}>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", fontWeight: "var(--w-semibold)", marginBottom: 2 }}>
        Clusters
      </span>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color || COLORS[i % COLORS.length], flexShrink: 0 }} />
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-2)" }}>
            {item.label || `Cluster ${i + 1}`}
          </span>
        </div>
      ))}
      <div style={{ borderTop: "1px solid var(--border)", marginTop: "var(--sp-1)", paddingTop: "var(--sp-1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-3)", flexShrink: 0 }} />
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>Size = centrality</span>
        </div>
      </div>
    </div>
  );
}
