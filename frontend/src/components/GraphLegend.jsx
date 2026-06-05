import { useState } from "react";
import { COMMUNITY_COLORS } from "./communityColors";

export default function GraphLegend({ communities = [] }) {
  // Collapsed by default on small screens where the legend would otherwise cover
  // too much of the canvas; open by default on desktop.
  const [open, setOpen] = useState(
    () => !(typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches)
  );

  const items = communities.length
    ? communities.slice(0, 8)
    : COMMUNITY_COLORS.slice(0, 5).map((c, i) => ({ id: i, color: c, label: `Cluster ${i + 1}` }));

  return (
    <div style={{
      position: "absolute", bottom: "var(--sp-3)", left: "var(--sp-3)",
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--r-md)", padding: "var(--sp-3)",
      display: "flex", flexDirection: "column", gap: "var(--sp-1)",
      zIndex: "var(--z-overlay)", backdropFilter: "blur(4px)",
      maxWidth: 180,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-2)",
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontSize: "var(--text-xs)", color: "var(--text-3)", fontWeight: "var(--w-semibold)",
        }}
      >
        Clusters <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)", maxHeight: 180, overflow: "auto", marginTop: 2 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color || COMMUNITY_COLORS[i % COMMUNITY_COLORS.length], flexShrink: 0 }} />
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
      )}
    </div>
  );
}
