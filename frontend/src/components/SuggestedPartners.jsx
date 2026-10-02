import { useEffect, useRef, useState } from "react";
import { getSuggestions } from "../api";
import Icon from "./Icon";
import TypeBadge from "./TypeBadge";

// Keys match the backend `role` filter of GET /api/suggest.
const ROLE_OPTIONS = [
  { value: "",          label: "Any role" },
  { value: "research",  label: "Research" },
  { value: "technical", label: "Technical" },
  { value: "policy",    label: "Policy / public body" },
  { value: "ngo",       label: "NGO" },
];

// "Suggested next partners" for a hand-picked consortium: institutions outside it
// that are already connected to it. Self-contained so GapView only renders it.
export default function SuggestedPartners({ topicId, consortium = [], onToggleConsortium }) {
  const [role, setRole] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [announce, setAnnounce] = useState("");
  const headingRef = useRef(null);

  // Refetch whenever the consortium membership changes (e.g. after "Add").
  const idsKey = consortium.map((i) => i.id).sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!topicId || !idsKey) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    getSuggestions(topicId, idsKey.split(",").map(Number).slice(0, 50), role) // API cap
      .then((d) => { if (!cancelled) setItems(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId, idsKey, role, reloadKey]);

  if (!consortium.length) return null;

  function add(s) {
    // Same shape the shortlist stores, so the consortium list/CSV keep working.
    onToggleConsortium({
      id: s.id, name: s.name, country: s.country, type: s.type,
      partner_fit_score: s.partner_fit_score, eu_projects: s.eu_projects,
    });
    setAnnounce(`${s.name} added to your consortium.`);
    // The row disappears on refetch, which would drop keyboard focus — park it on the heading.
    headingRef.current?.focus();
  }

  return (
    <section className="card suggest-card" aria-labelledby="suggest-title" aria-busy={loading}>
      <div className="suggest-head">
        <h3 id="suggest-title" className="subhead" tabIndex={-1} ref={headingRef}>Suggested next partners</h3>
        <label className="suggest-filter">
          <span className="eyebrow">Role</span>
          <select className="filter-select" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <p className="muted" style={{ margin: "var(--sp-1) 0 var(--sp-3)" }}>
        Connected to your partners through co-authorship or EU projects, ranked with their partner fit.
      </p>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      {loading ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading suggestions…</span>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ height: 40, marginBottom: "var(--sp-2)", borderRadius: "var(--r-md)" }} />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="evidence-msg">
          <span>Couldn’t load suggestions.</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <p className="muted evidence-empty">
          {role
            ? "No connected institutions match this role. Try another role."
            : "No connected institutions found for this consortium yet."}
        </p>
      ) : (
        <ul className="evidence-list">
          {items.map((s) => (
            <li key={s.id} className="evidence-item">
              <div className="evidence-main">
                <div className="evidence-title">{s.name}</div>
                <div className="inst-meta">{[s.country, s.why].filter(Boolean).join(" · ")}</div>
              </div>
              <TypeBadge type={s.type} />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => add(s)}
                aria-label={`Add ${s.name} to consortium`}
              >
                <Icon name="plus" size={12} /> Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
