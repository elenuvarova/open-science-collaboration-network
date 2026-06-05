export default function EmptyState({ icon = "🔍", title, body, action }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "var(--sp-12) var(--sp-6)",
      textAlign: "center", gap: "var(--sp-3)",
    }}>
      <div style={{ fontSize: "var(--text-3xl)", lineHeight: 1 }} aria-hidden="true">{icon}</div>
      <p style={{ fontSize: "var(--text-lg)", fontWeight: "var(--w-semibold)", color: "var(--text-1)" }}>
        {title}
      </p>
      {body && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)", maxWidth: 320, lineHeight: "var(--leading-relaxed)" }}>
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: "var(--sp-2)" }}>{action}</div>}
    </div>
  );
}
