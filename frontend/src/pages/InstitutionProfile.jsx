import { useEffect, useState } from "react";
import { getInstitution } from "../api";
import ScoreCard from "../components/ScoreCard";

export default function InstitutionProfile({ id, topicId, onBack }) {
  const [inst, setInst] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getInstitution(id, topicId)
      .then(setInst)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id, topicId]);

  if (loading) return <div className="spinner">Loading…</div>;
  if (error)   return <div className="muted">Error: {error.message}</div>;
  if (!inst)   return <div className="muted">Not found</div>;

  return (
    <div>
      {onBack && <button className="back-btn" onClick={onBack}>← Back to shortlist</button>}
      <div className="card">
        <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--w-semibold)", marginBottom: "var(--sp-1)", letterSpacing: "-0.01em" }}>
          {inst.name}
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)", marginBottom: "var(--sp-5)" }}>
          {[inst.country, inst.type?.replace("_", " ")].filter(Boolean).join(" · ")}
          {inst.ror_id && (
            <> · <a href={inst.ror_id} target="_blank" rel="noreferrer">ROR ↗</a></>
          )}
        </p>

        <div style={{ display: "flex", gap: "var(--sp-6)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
          <div className="stat">
            <div className="stat-value">{inst.recent_works}</div>
            <div className="stat-label">publications 2020–25</div>
          </div>
          <div className="stat">
            <div className="stat-value">{inst.eu_projects}</div>
            <div className="stat-label">EU projects</div>
          </div>
          {inst.community_id != null && (
            <div className="stat">
              <div className="stat-value">#{inst.community_id}</div>
              <div className="stat-label">cluster</div>
            </div>
          )}
        </div>

        <div className="divider" />
        <ScoreCard score={inst.partner_fit_score} breakdown={inst.score_breakdown} />
      </div>
    </div>
  );
}
