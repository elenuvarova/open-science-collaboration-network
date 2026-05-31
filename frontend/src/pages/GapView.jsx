import { useEffect, useState } from "react";
import { getInstitutions } from "../api";

const ROLES = [
  { key: "research",   label: "Research lead",        types: ["university"] },
  { key: "technical",  label: "Technical partner",     types: ["company"] },
  { key: "policy",     label: "Policy / public body",  types: ["public_body"] },
  { key: "ngo",        label: "NGO / civil society",   types: ["ngo"] },
  { key: "evaluation", label: "Impact evaluation",     types: ["university", "company"] },
  { key: "geographic", label: "Geographic diversity",  types: [] },
];

function strengthLevel(count) {
  if (count >= 20) return "strong";
  if (count >= 5)  return "medium";
  return "weak";
}

export default function GapView({ topicId }) {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!topicId) return;
    getInstitutions({ topic: topicId, limit: 200 }).then(setInstitutions).finally(() => setLoading(false));
  }, [topicId]);

  if (loading) return <div className="spinner">Loading…</div>;

  const byType = {};
  for (const inst of institutions) {
    const t = inst.type || "unknown";
    byType[t] = (byType[t] || 0) + 1;
  }
  const countries = [...new Set(institutions.map((i) => i.country).filter(Boolean))].sort();

  return (
    <div>
      <p className="muted" style={{ marginBottom: "var(--sp-1)" }}>
        Consortium role coverage · {institutions.length} institutions in network
      </p>

      <div className="gap-grid">
        {ROLES.map((role) => {
          const count = role.key === "geographic"
            ? countries.length
            : role.types.reduce((s, t) => s + (byType[t] || 0), 0);
          const level = role.key === "geographic"
            ? (count >= 10 ? "strong" : count >= 5 ? "medium" : "weak")
            : strengthLevel(count);

          const label = level === "strong" ? "Strong ✓" : level === "medium" ? "Medium" : "Weak — gap";
          return (
            <div className="gap-card" key={role.key}>
              <div className="gap-card-title">{role.label}</div>
              <div className={`gap-card-status gap-${level}`}>{label}</div>
              <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--sp-1)" }}>
                {count} {role.key === "geographic" ? "countries" : "institutions"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: "var(--sp-5)" }}>
        <p style={{ fontSize: "var(--text-sm)", fontWeight: "var(--w-semibold)", marginBottom: "var(--sp-3)" }}>
          Country coverage
        </p>
        <div>{countries.map((c) => <span className="tag" key={c}>{c}</span>)}</div>
      </div>
    </div>
  );
}
