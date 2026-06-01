import { useEffect, useRef, useState } from "react";
import { getInstitutions } from "../api";
import InstitutionProfile from "./InstitutionProfile";
import TypeBadge from "../components/TypeBadge";
import ScoreRing from "../components/ScoreRing";
import SkeletonList from "../components/SkeletonList";
import EmptyState from "../components/EmptyState";

const COUNTRIES = ["BE", "GB", "NL", "FR", "DE", "SE", "NO", "DK", "FI", "IT", "ES", "PL", "CH", "AT"];
const TYPES = [
  { value: "education",   label: "Education" },
  { value: "company",     label: "Company" },
  { value: "government",  label: "Government" },
  { value: "nonprofit",   label: "NGO / nonprofit" },
  { value: "healthcare",  label: "Healthcare" },
];

function fmt(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

function scoreClass(s) {
  return s >= 70 ? "score-high" : s >= 50 ? "score-mid" : "score-low";
}

const SCORE_MAX = {
  topic_relevance: 30, publication_activity: 20, eu_project_participation: 20,
  network_centrality: 15, country_diversity: 10, recent_activity: 5,
};

function HoverCard({ inst, anchor }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const cardRef = useRef(null);

  useEffect(() => {
    if (!anchor || !cardRef.current) return;
    const rect = anchor.getBoundingClientRect();
    const cardH = cardRef.current.offsetHeight || 200;
    const winH = window.innerHeight;
    const top = Math.min(rect.top, winH - cardH - 16);
    setPos({ top, left: rect.right + 12 });
  }, [anchor]);

  if (!inst || !anchor) return null;

  const breakdown = inst.score_breakdown || {};
  const entries = Object.entries(breakdown).slice(0, 6);

  return (
    <div
      ref={cardRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 200,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        padding: "var(--sp-4)",
        width: 240,
        boxShadow: "var(--shadow-lg)",
        pointerEvents: "none",
        animation: "fadeIn 0.12s ease",
      }}
    >
      <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", marginBottom: "var(--sp-3)" }}>
        <ScoreRing score={inst.partner_fit_score} size={52} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--w-semibold)", lineHeight: "var(--leading-snug)", color: "var(--text-1)" }}>
            {inst.name}
          </div>
          <div style={{ marginTop: 4 }}>
            <TypeBadge type={inst.type} />
          </div>
        </div>
      </div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: 4 }}>
          <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: "var(--r-full)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min((v / (SCORE_MAX[k] || 30)) * 100, 100)}%`, background: "var(--accent)", borderRadius: "var(--r-full)" }} />
          </div>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", width: 24, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v.toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Shortlist({ topicId, consortium = [], onToggleConsortium }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("");
  const [type, setType] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const hoverTimer = useRef(null);

  useEffect(() => {
    if (!topicId) return;
    setLoading(true);
    const params = { topic: topicId, limit: 100 };
    if (country) params.country = country;
    if (type) params.type = type;
    if (minScore > 0) params.min_score = minScore;
    getInstitutions(params).then(setList).finally(() => setLoading(false));
  }, [topicId, country, type, minScore]);

  function onMouseEnter(inst, el) {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setHovered(inst);
      setHoverAnchor(el);
    }, 280);
  }

  function onMouseLeave() {
    clearTimeout(hoverTimer.current);
    setHovered(null);
    setHoverAnchor(null);
  }

  if (selected) {
    return <InstitutionProfile id={selected} topicId={topicId} onBack={() => setSelected(null)} />;
  }

  const consortiumIds = new Set(consortium.map(i => i.id));

  return (
    <div>
      {consortium.length > 0 && (
        <div className="card" style={{ marginBottom: "var(--sp-4)", display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--w-semibold)", color: "var(--text-1)" }}>
            My Consortium ({consortium.length})
          </span>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", flex: 1 }}>
            {consortium.map(inst => (
              <span key={inst.id} className="tag" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                onClick={() => onToggleConsortium(inst)}>
                {inst.name} ×
              </span>
            ))}
          </div>
          <button
            className="filter-select"
            style={{ cursor: "pointer", fontSize: "var(--text-xs)" }}
            onClick={() => {
              const header = "Rank,Name,Country,Type,Score";
              const rows = consortium.map((inst, i) =>
                [i + 1, `"${inst.name.replace(/"/g, '""')}"`, inst.country || "", inst.type || "",
                 inst.partner_fit_score.toFixed(0)].join(",")
              );
              const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "consortium.csv";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Export consortium
          </button>
        </div>
      )}
      <div className="filter-bar">
        <select className="filter-select" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="filter-select" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
          <option value={0}>Any score</option>
          <option value={50}>Score 50+</option>
          <option value={60}>Score 60+</option>
          <option value={70}>Score 70+</option>
          <option value={80}>Score 80+</option>
        </select>
        {!loading && <span className="muted">{list.length} institutions</span>}
        {!loading && list.length > 0 && (
          <button
            className="filter-select"
            style={{ cursor: "pointer" }}
            onClick={() => {
              const header = "Rank,Name,Country,Type,Score,EU Projects,Works";
              const rows = list.slice(0, 50).map((inst, i) =>
                [i + 1, `"${inst.name.replace(/"/g, '""')}"`, inst.country || "", inst.type || "",
                 inst.partner_fit_score.toFixed(0), inst.eu_projects, inst.recent_works].join(",")
              );
              const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "partners.csv";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Export CSV
          </button>
        )}
      </div>

      {loading && <SkeletonList rows={10} />}

      {!loading && list.length === 0 && (
        <EmptyState
          icon="🔭"
          title="No institutions found"
          body="Try adjusting the country or type filter, or wait for the ETL to finish ingesting data for this topic."
        />
      )}

      {!loading && list.map((inst, i) => {
        const inConsortium = consortiumIds.has(inst.id);
        return (
          <div
            key={inst.id}
            className="inst-row"
            style={inConsortium ? { borderLeft: "2px solid var(--accent)", paddingLeft: "calc(var(--sp-3) - 2px)" } : undefined}
            onClick={() => setSelected(inst.id)}
            onMouseEnter={(e) => onMouseEnter(inst, e.currentTarget)}
            onMouseLeave={onMouseLeave}
          >
            <span className="inst-rank">{i + 1}</span>
            <div className="inst-info">
              <div className="inst-name">{inst.name}</div>
              <div className="inst-meta" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap", marginTop: 3 }}>
                <TypeBadge type={inst.type} />
                <span>{inst.country}</span>
                <span>·</span>
                <span>{fmt(inst.recent_works)} works</span>
                {inst.eu_projects > 0 && <><span>·</span><span>{inst.eu_projects} EU projects</span></>}
              </div>
            </div>
            <span className={`score-pill ${scoreClass(inst.partner_fit_score)}`}>
              {inst.partner_fit_score.toFixed(0)}
            </span>
            {onToggleConsortium && (
              <button
                title={inConsortium ? "Remove from consortium" : "Add to consortium"}
                onClick={(e) => { e.stopPropagation(); onToggleConsortium(inst); }}
                style={{
                  marginLeft: "var(--sp-2)",
                  width: 24, height: 24,
                  borderRadius: "var(--r-full)",
                  border: "1px solid var(--border)",
                  background: inConsortium ? "var(--accent)" : "none",
                  color: inConsortium ? "#fff" : "var(--text-3)",
                  fontSize: 14, lineHeight: 1,
                  cursor: "pointer", flexShrink: 0,
                  transition: "background 120ms, color 120ms",
                }}
              >
                {inConsortium ? "✓" : "+"}
              </button>
            )}
          </div>
        );
      })}

      <HoverCard inst={hovered} anchor={hoverAnchor} />
    </div>
  );
}
