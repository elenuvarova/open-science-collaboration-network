import { useEffect, useState } from "react";
import { getEvidence } from "../api";
import TypeBadge from "./TypeBadge";

const EUR = new Intl.NumberFormat("en", {
  style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1,
});
const fmtEur = (n) => (n ? EUR.format(n) : "–");

function years(p) {
  if (p.start_year && p.end_year && p.start_year !== p.end_year) return `${p.start_year}–${p.end_year}`;
  return p.start_year || p.end_year || null;
}

const EDGE_LABELS = { coauthor: "co-authored", project: "EU projects" };

// Evidence behind the score: CORDIS projects, totals and the closest co-partners.
export default function EvidenceSection({ id, topicId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getEvidence(id, topicId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, topicId, reloadKey]);

  return (
    <section className="evidence" aria-labelledby="evidence-title">
      <h3 id="evidence-title" className="subhead">Evidence</h3>
      {loading ? <EvidenceSkeleton />
        : error ? (
          <div role="alert" className="evidence-msg">
            <span>Couldn’t load the evidence.</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
          </div>
        ) : <EvidenceBody data={data} />}
    </section>
  );
}

function EvidenceSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading evidence…</span>
      <div style={{ display: "flex", gap: "var(--sp-6)", margin: "var(--sp-4) 0" }}>
        {[1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 48, width: 80, borderRadius: "var(--r-md)" }} />)}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="skel" style={{ height: 14, width: `${85 - i * 12}%`, marginBottom: "var(--sp-3)" }} />
      ))}
    </div>
  );
}

function EvidenceBody({ data }) {
  const { totals, projects, co_partners: partners } = data;
  return (
    <>
      <div className="evidence-totals" role="group" aria-label="Evidence totals">
        <Stat value={totals.projects} label="CORDIS projects" />
        <Stat value={totals.coordinator} label="as coordinator" />
        <Stat value={fmtEur(totals.ec_contribution)} label="EC funding" />
      </div>
      <p className="muted evidence-note">Funding is each project’s total EC contribution, not this institution’s share.</p>

      <h4 className="evidence-h">Recent projects</h4>
      {projects.length === 0 ? (
        <p className="muted evidence-empty">No CORDIS projects on record for this institution.</p>
      ) : (
        <>
          <ul className="evidence-list">
            {projects.map((p) => (
              <li key={p.id} className="evidence-item">
                <div className="evidence-main">
                  <div className="evidence-title">{p.title}</div>
                  <div className="inst-meta">
                    {[p.programme, years(p), p.ec_contribution ? fmtEur(p.ec_contribution) : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className={`role-badge role-${p.role}`}>{p.role === "coordinator" ? "Coordinator" : "Participant"}</span>
              </li>
            ))}
          </ul>
          {totals.projects > projects.length && (
            <p className="muted evidence-note">Showing the {projects.length} newest of {totals.projects} projects.</p>
          )}
        </>
      )}

      <h4 className="evidence-h">Works most with</h4>
      {partners.length === 0 ? (
        <p className="muted evidence-empty">No co-partners recorded for this topic.</p>
      ) : (
        <ul className="evidence-list">
          {partners.map((c) => (
            <li key={c.id} className="evidence-item">
              <div className="evidence-main">
                <div className="evidence-title">{c.name}</div>
                <div className="inst-meta">
                  {[c.country, c.edge_types.map((t) => EDGE_LABELS[t] || t).join(" + ")].filter(Boolean).join(" · ")}
                </div>
              </div>
              <TypeBadge type={c.type} />
              <span className="evidence-weight" aria-label={`link strength ${c.weight}`}>{c.weight}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ value, label }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
