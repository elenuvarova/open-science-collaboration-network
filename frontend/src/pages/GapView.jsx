import { useEffect, useState } from "react";
import { getInstitutions } from "../api";

const ROLES = [
  { key: "research",    label: "Research lead",          types: ["university"] },
  { key: "technical",   label: "Technical partner",      types: ["company"] },
  { key: "policy",      label: "Policy / public body",   types: ["public_body"] },
  { key: "ngo",         label: "NGO / civil society",    types: ["ngo"] },
  { key: "evaluation",  label: "Impact evaluation",      types: ["university", "company"] },
  { key: "geographic",  label: "Geographic diversity",   types: [] },
];

export default function GapView({ topicId }) {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!topicId) return;
    getInstitutions({ topic: topicId, limit: 200 })
      .then(setInstitutions)
      .finally(() => setLoading(false));
  }, [topicId]);

  if (loading) return <div className="spinner">Loading…</div>;

  const byType = {};
  for (const inst of institutions) {
    const t = inst.type || "unknown";
    byType[t] = (byType[t] || 0) + 1;
  }

  const countries = [...new Set(institutions.map((i) => i.country).filter(Boolean))];

  function strength(role) {
    if (role.key === "geographic") {
      const n = countries.length;
      if (n >= 10) return "strong";
      if (n >= 5) return "medium";
      return "weak";
    }
    const count = role.types.reduce((s, t) => s + (byType[t] || 0), 0);
    if (count >= 20) return "strong";
    if (count >= 5) return "medium";
    return "weak";
  }

  function detail(role) {
    if (role.key === "geographic") return `${countries.length} countries`;
    const count = role.types.reduce((s, t) => s + (byType[t] || 0), 0);
    return `${count} institutions`;
  }

  return (
    <div>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        Consortium role coverage based on {institutions.length} institutions in the network.
      </p>
      <div className="gap-grid">
        {ROLES.map((role) => {
          const s = strength(role);
          return (
            <div className="gap-card" key={role.key}>
              <div className="gap-card-title">{role.label}</div>
              <div className={`gap-card-status gap-${s}`}>
                {s === "strong" ? "Strong ✓" : s === "medium" ? "Medium" : "Weak — gap"}
              </div>
              <div className="muted" style={{ fontSize: "0.78rem", marginTop: "0.4rem" }}>
                {detail(role)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <div style={{ fontWeight: 600, marginBottom: "0.75rem", fontSize: "0.9rem" }}>Country coverage</div>
        <div>{countries.sort().map((c) => <span className="tag" key={c}>{c}</span>)}</div>
      </div>
    </div>
  );
}
