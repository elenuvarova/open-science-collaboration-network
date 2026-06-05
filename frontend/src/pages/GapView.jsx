import { useEffect, useState } from "react";
import { getInstitutions } from "../api";
import EmptyState from "../components/EmptyState";

const ROLES = [
  { key: "research",   label: "Research lead",        types: ["education", "university"] },
  { key: "technical",  label: "Technical partner",     types: ["company", "facility"] },
  { key: "policy",     label: "Policy / public body",  types: ["government", "public_body"] },
  { key: "ngo",        label: "NGO / civil society",   types: ["ngo", "nonprofit"] },
  { key: "evaluation", label: "Impact evaluation",     types: ["education", "university", "company"] },
  { key: "geographic", label: "Geographic diversity",  types: [] },
];

function strengthLevel(count) {
  if (count >= 20) return "strong";
  if (count >= 5)  return "medium";
  return "weak";
}

function GapGrid({ institutions, isConsortium = false }) {
  const byType = {};
  for (const inst of institutions) {
    const t = inst.type || "unknown";
    byType[t] = (byType[t] || 0) + 1;
  }
  const countries = [...new Set(institutions.map((i) => i.country).filter(Boolean))].sort();

  return (
    <>
      <div className="gap-grid">
        {ROLES.map((role) => {
          const count = role.key === "geographic"
            ? countries.length
            : role.types.reduce((s, t) => s + (byType[t] || 0), 0);

          let level;
          if (isConsortium) {
            // For a hand-picked consortium, thresholds are per-org, not per-network
            level = role.key === "geographic"
              ? (count >= 4 ? "strong" : count >= 2 ? "medium" : "weak")
              : (count >= 2 ? "strong" : count >= 1 ? "medium" : "weak");
          } else {
            level = role.key === "geographic"
              ? (count >= 10 ? "strong" : count >= 5 ? "medium" : "weak")
              : strengthLevel(count);
          }

          const label = level === "strong" ? "Covered ✓" : level === "medium" ? "Partial" : "Gap";
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
        <p className="eyebrow" style={{ marginBottom: "var(--sp-3)" }}>Country coverage</p>
        <div>
          {countries.length
            ? countries.map((c) => <span className="tag" key={c}>{c}</span>)
            : <span className="muted" style={{ fontSize: "var(--text-xs)" }}>No countries selected</span>}
        </div>
      </div>
    </>
  );
}

export default function GapView({ topicId, consortium = [], onClearConsortium }) {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [mode, setMode] = useState("network");

  useEffect(() => {
    if (!topicId) return;
    setLoading(true);
    setError(false);
    let cancelled = false;
    getInstitutions({ topic: topicId, limit: 200 })
      .then((d) => { if (!cancelled) setInstitutions(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId, reloadKey]);

  // Auto-switch to consortium view when user starts adding orgs
  useEffect(() => {
    if (consortium.length > 0) setMode("consortium");
    if (consortium.length === 0) setMode("network");
  }, [consortium.length]);

  if (loading) return (
    <div>
      <div className="gap-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="gap-card" key={i}>
            <div className="skel" style={{ height: 10, width: "60%", marginBottom: "var(--sp-3)" }} />
            <div className="skel" style={{ height: 28, width: "80%", marginBottom: "var(--sp-2)" }} />
            <div className="skel" style={{ height: 10, width: "40%" }} />
          </div>
        ))}
      </div>
    </div>
  );

  if (error && consortium.length === 0) return (
    <EmptyState
      icon="⚠️"
      title="Couldn’t load network data"
      body="The server didn’t respond — it may be waking up. Give it a moment and try again."
      action={<button className="btn btn-primary btn-sm" onClick={() => setReloadKey(k => k + 1)}>Retry</button>}
    />
  );

  const activeInstitutions = mode === "consortium" ? consortium : institutions;
  const label = mode === "consortium"
    ? `${consortium.length} selected · go to Partner Shortlist to add/remove`
    : `${institutions.length} institutions in network`;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-4)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--sp-1)", background: "var(--border)", borderRadius: "var(--r-md)", padding: 2 }}>
          {["network", "consortium"].map(m => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} style={{
              padding: "var(--sp-2) var(--sp-3)",
              borderRadius: "var(--r-sm)",
              border: "none",
              background: mode === m ? "var(--surface)" : "none",
              color: mode === m ? "var(--text-1)" : "var(--text-2)",
              fontSize: "var(--text-xs)",
              fontWeight: mode === m ? "var(--w-semibold)" : "normal",
              cursor: "pointer",
              transition: "background 120ms, color 120ms",
            }}>
              {m === "network" ? "Full network" : `My Consortium${consortium.length ? ` (${consortium.length})` : ""}`}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>{label}</p>
        {mode === "consortium" && consortium.length > 0 && onClearConsortium && (
          <button onClick={onClearConsortium} style={{
            background: "none", border: "none", fontSize: "var(--text-xs)",
            color: "var(--text-3)", cursor: "pointer", textDecoration: "underline",
          }}>Clear</button>
        )}
      </div>

      {mode === "consortium" && consortium.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "var(--sp-8)" }}>
          <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--sp-3)" }}>🏛</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>
            No institutions selected. Use the <strong>+</strong> button in Partner Shortlist to build your consortium.
          </div>
        </div>
      ) : (
        <GapGrid institutions={activeInstitutions} isConsortium={mode === "consortium"} />
      )}
    </div>
  );
}
