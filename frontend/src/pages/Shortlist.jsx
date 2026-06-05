import { useEffect, useRef, useState } from "react";
import { getInstitutions } from "../api";
import InstitutionProfile from "./InstitutionProfile";
import TypeBadge from "../components/TypeBadge";
import ScoreRing from "../components/ScoreRing";
import SkeletonList from "../components/SkeletonList";
import EmptyState from "../components/EmptyState";
import { SCORE_MAX } from "../components/scoreMeta";

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

export default function Shortlist({ topicId, consortium = [], onToggleConsortium, onGoToGaps, profileId = null, onOpenProfile, onCloseProfile }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("");
  const [type, setType] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [hovered, setHovered] = useState(null);
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const hoverTimer = useRef(null);

  useEffect(() => {
    if (!topicId) return;
    setLoading(true);
    setError(false);
    const params = { topic: topicId, limit: 100 };
    if (country) params.country = country;
    if (type) params.type = type;
    if (minScore > 0) params.min_score = minScore;
    let cancelled = false;
    getInstitutions(params)
      .then((d) => { if (!cancelled) setList(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId, country, type, minScore, reloadKey]);

  const hasFilters = Boolean(country || type || minScore > 0);
  function clearFilters() { setCountry(""); setType(""); setMinScore(0); }

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

  if (profileId) {
    return <InstitutionProfile id={profileId} topicId={topicId} onBack={onCloseProfile} />;
  }

  const consortiumIds = new Set(consortium.map(i => i.id));

  return (
    <div>
      {consortium.length > 0 && (
        <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--w-semibold)", color: "var(--text-1)" }}>
              My Consortium ({consortium.length})
            </span>
            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", flex: 1 }}>
              {consortium.map(inst => (
                <button key={inst.id} className="tag" aria-label={`Remove ${inst.name} from consortium`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                  onClick={() => onToggleConsortium(inst)}>
                  {inst.name} ×
                </button>
              ))}
            </div>
            <button
              className="btn btn-secondary btn-sm"
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
          {onGoToGaps && (
            <div style={{ marginTop: "var(--sp-2)" }}>
              <button className="btn btn-ghost btn-sm" onClick={onGoToGaps}>
                → Check role coverage
              </button>
            </div>
          )}
        </div>
      )}
      <div className="filter-bar">
        <select className="filter-select" aria-label="Filter by country" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="filter-select" aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="filter-select" aria-label="Minimum partner fit score" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
          <option value={0}>Any score</option>
          <option value={50}>Score 50+</option>
          <option value={60}>Score 60+</option>
          <option value={70}>Score 70+</option>
          <option value={80}>Score 80+</option>
        </select>
        {!loading && <span className="muted">{list.length} institutions</span>}
        {!loading && list.length > 0 && (
          <button
            className="btn btn-secondary btn-sm"
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

      {!loading && error && (
        <EmptyState
          icon="⚠️"
          title="Couldn’t load partners"
          body="The server didn’t respond — it may be waking up. Give it a moment and try again."
          action={<button className="btn btn-primary btn-sm" onClick={() => setReloadKey(k => k + 1)}>Retry</button>}
        />
      )}

      {!loading && !error && list.length === 0 && (
        hasFilters ? (
          <EmptyState
            icon="🔭"
            title="No partners match these filters"
            body="Try widening the country, type, or minimum-score filter to see more institutions."
            action={<button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>}
          />
        ) : (
          <EmptyState
            icon="🔭"
            title="No partners yet for this topic"
            body="Collaboration data for this topic isn’t available yet. Check back shortly."
          />
        )
      )}

      {!loading && !error && list.map((inst, i) => {
        const inConsortium = consortiumIds.has(inst.id);
        return (
          <div
            key={inst.id}
            className={`inst-row${inConsortium ? " in-consortium" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onOpenProfile(inst.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenProfile(inst.id);
              }
            }}
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
                aria-label={inConsortium ? "Remove from consortium" : "Add to consortium"}
                onClick={(e) => { e.stopPropagation(); onToggleConsortium(inst); }}
                style={{
                  marginLeft: "var(--sp-2)",
                  width: 30, height: 30,
                  borderRadius: "var(--r-full)",
                  border: "1px solid var(--border)",
                  background: inConsortium ? "var(--accent)" : "none",
                  color: inConsortium ? "var(--on-accent)" : "var(--text-3)",
                  fontSize: 16, lineHeight: 1,
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
