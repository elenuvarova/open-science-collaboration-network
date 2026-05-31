export default function EmptyState({ icon = "🔍", title, body }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "var(--sp-12) var(--sp-6)",
      textAlign: "center", gap: "var(--sp-3)",
    }}>
      <div style={{ fontSize: "2.5rem", lineHeight: 1 }}>{icon}</div>
      <p style={{ fontSize: "var(--text-md)", fontWeight: "var(--w-semibold)", color: "var(--text-1)" }}>
        {title}
      </p>
      {body && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)", maxWidth: 320, lineHeight: "var(--leading-relaxed)" }}>
          {body}
        </p>
      )}
    </div>
  );
}
