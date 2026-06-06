export default function EmptyState({ icon = "🔍", title, body, action, role }) {
  return (
    <div
      role={role}
      aria-live={role === "status" ? "polite" : undefined}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "var(--sp-12) var(--sp-6)",
        textAlign: "center", gap: "var(--sp-3)",
      }}
    >
      <div style={{ fontSize: "var(--text-3xl)", lineHeight: 1 }} aria-hidden="true">{icon}</div>
      <p className="subhead">{title}</p>
      {body && (
        <p className="body-text" style={{ maxWidth: 320, color: "var(--text-3)" }}>
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: "var(--sp-2)" }}>{action}</div>}
    </div>
  );
}
