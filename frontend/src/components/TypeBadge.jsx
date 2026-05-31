const TYPE_CONFIG = {
  university:  { label: "University",   color: "#60a5fa", bg: "#1e3a6e" },
  company:     { label: "Company",      color: "#4ade80", bg: "#14532d" },
  ngo:         { label: "NGO",          color: "#fbbf24", bg: "#451a03" },
  public_body: { label: "Public body",  color: "#c084fc", bg: "#2e1065" },
  healthcare:  { label: "Healthcare",   color: "#f472b6", bg: "#4a0a2e" },
  facility:    { label: "Facility",     color: "#34d399", bg: "#065f46" },
  other:       { label: "Other",        color: "#94a3b8", bg: "#1e293b" },
  unknown:     { label: "Unknown",      color: "#94a3b8", bg: "#1e293b" },
};

// Light theme overrides
const TYPE_CONFIG_LIGHT = {
  university:  { color: "#1d4ed8", bg: "#dbeafe" },
  company:     { color: "#16a34a", bg: "#dcfce7" },
  ngo:         { color: "#b45309", bg: "#fef3c7" },
  public_body: { color: "#7c3aed", bg: "#ede9fe" },
  healthcare:  { color: "#be185d", bg: "#fce7f3" },
  facility:    { color: "#0f766e", bg: "#ccfbf1" },
  other:       { color: "#64748b", bg: "#f1f5f9" },
  unknown:     { color: "#64748b", bg: "#f1f5f9" },
};

export function getTypeConfig(type, theme = "dark") {
  const key = type?.toLowerCase().replace(/ /g, "_") || "unknown";
  const base = TYPE_CONFIG[key] || TYPE_CONFIG.unknown;
  const light = TYPE_CONFIG_LIGHT[key] || TYPE_CONFIG_LIGHT.unknown;
  return theme === "light" ? { ...base, ...light } : base;
}

export default function TypeBadge({ type, theme = "dark" }) {
  const cfg = getTypeConfig(type, theme);
  const label = TYPE_CONFIG[type?.toLowerCase().replace(/ /g, "_")]?.label
    || type?.replace("_", " ")
    || "Unknown";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--w-semibold)",
      padding: "2px 8px",
      borderRadius: "var(--r-full)",
      background: cfg.bg,
      color: cfg.color,
      letterSpacing: "0.01em",
      lineHeight: 1.6,
    }}>
      {label}
    </span>
  );
}
