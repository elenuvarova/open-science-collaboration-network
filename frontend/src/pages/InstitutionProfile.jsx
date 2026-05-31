import { useEffect, useState } from "react";
import { getInstitution } from "../api";
import ScoreCard from "../components/ScoreCard";
import ScoreRing from "../components/ScoreRing";
import TypeBadge from "../components/TypeBadge";

export default function InstitutionProfile({ id, topicId, onBack }) {
  const [inst, setInst] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getInstitution(id, topicId).then(setInst).catch(setError).finally(() => setLoading(false));
  }, [id, topicId]);

  if (loading) return (
    <div>
      {onBack && <button className="back-btn" onClick={onBack}>← Back</button>}
      <div className="card">
        <div className="skel" style={{ height: 22, width: "55%", borderRadius: "var(--r-sm)", marginBottom: "var(--sp-2)" }} />
        <div className="skel" style={{ height: 13, width: "30%", borderRadius: "var(--r-sm)", marginBottom: "var(--sp-5)" }} />
        <div style={{ display: "flex", gap: "var(--sp-6)" }}>
          {[1,2,3].map(i => <div key={i} className="skel" style={{ height: 48, width: 80, borderRadius: "var(--r-md)" }} />)}
        </div>
      </div>
    </div>
  );

  if (error) return <div className="muted">Error: {error.message}</div>;
  if (!inst)  return <div className="muted">Not found</div>;

  return (
    <div className="fade-in">
      {onBack && <button className="back-btn" onClick={onBack}>← Back to shortlist</button>}
      <div className="card">
        {/* Header */}
        <div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "flex-start", marginBottom: "var(--sp-5)" }}>
          <ScoreRing score={inst.partner_fit_score} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--w-semibold)", letterSpacing: "-0.01em", lineHeight: "var(--leading-snug)", marginBottom: "var(--sp-2)" }}>
              {inst.name}
            </h2>
            <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
              <TypeBadge type={inst.type} />
              {inst.country && (
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", fontWeight: "var(--w-medium)" }}>
                  {inst.country}
                </span>
              )}
              {inst.ror_id && (
                <a href={inst.ror_id} target="_blank" rel="noreferrer"
                   style={{ fontSize: "var(--text-xs)", color: "var(--accent)" }}>
                  ROR ↗
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: "var(--sp-6)", marginBottom: "var(--sp-5)", flexWrap: "wrap" }}>
          <Stat value={inst.recent_works} label="publications 2020–25" />
          <Stat value={inst.eu_projects}  label="EU projects" />
          {inst.community_id != null && <Stat value={`#${inst.community_id}`} label="cluster" />}
        </div>

        <div className="divider" />
        <ScoreCard score={inst.partner_fit_score} breakdown={inst.score_breakdown} />
      </div>
    </div>
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
