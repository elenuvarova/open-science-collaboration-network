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
  if (error) return <div className="muted">Error: {error.message}</div>;
  if (!inst) return <div className="muted">Not found</div>;

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back to shortlist</button>
      <div className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>{inst.name}</h2>
        <div className="inst-meta" style={{ marginBottom: "1.25rem" }}>
          {inst.country} · {(inst.type || "unknown").replace("_", " ")}
          {inst.ror_id && (
            <> · <a href={inst.ror_id} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>ROR ↗</a></>
          )}
        </div>

        <div style={{ display: "flex", gap: "2rem", marginBottom: "1.5rem" }}>
          <Stat value={inst.recent_works} label="publications (2020–25)" />
          <Stat value={inst.eu_projects} label="EU projects" />
          {inst.community_id != null && <Stat value={`#${inst.community_id}`} label="cluster" />}
        </div>

        <ScoreCard score={inst.partner_fit_score} breakdown={inst.score_breakdown} />
      </div>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}
