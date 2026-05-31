import { useEffect, useState } from "react";
import { getInstitutions } from "../api";
import InstitutionProfile from "./InstitutionProfile";

const COUNTRIES = ["BE", "GB", "NL", "FR", "DE", "SE", "NO", "DK", "FI", "IT", "ES", "PL", "CH", "AT"];
const TYPES = ["university", "company", "ngo", "public_body"];

function scoreClass(s) {
  return s >= 70 ? "score-high" : s >= 50 ? "score-mid" : "score-low";
}

export default function Shortlist({ topicId }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("");
  const [type, setType] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!topicId) return;
    setLoading(true);
    const params = { topic: topicId, limit: 100 };
    if (country) params.country = country;
    if (type) params.type = type;
    getInstitutions(params)
      .then(setList)
      .finally(() => setLoading(false));
  }, [topicId, country, type]);

  if (selected) {
    return <InstitutionProfile id={selected} topicId={topicId} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="filter-bar">
        <select className="filter-select" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
        <span className="muted">{list.length} institutions</span>
      </div>

      {loading && <div className="spinner">Loading…</div>}
      {!loading && list.map((inst, i) => (
        <div className="inst-row" key={inst.id} onClick={() => setSelected(inst.id)}>
          <span className="inst-rank">{i + 1}</span>
          <div className="inst-info">
            <div className="inst-name">{inst.name}</div>
            <div className="inst-meta">
              {[inst.country, inst.type?.replace("_", " "), `${inst.recent_works} works`, `${inst.eu_projects} EU projects`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <span className={`score-pill ${scoreClass(inst.partner_fit_score)}`}>
            {inst.partner_fit_score.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}
