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

// Institution names come from upstream open data, so treat every exported cell as
// untrusted: neutralize spreadsheet formula injection (a leading = + - @ or control
// char can execute in Excel/Sheets) and quote/escape CSV-special characters.
function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadCsv(filename, header, rows) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const HOVER_CARD_W = 240; // keep in sync with the card's `width` below

function HoverCard({ inst, anchor }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const cardRef = useRef(null);

  useEffect(() => {
    if (!anchor || !cardRef.current) return;
    const rect = anchor.getBoundingClientRect();
    const cardH = cardRef.current.offsetHeight || 200;
    const winH = window.innerHeight;
    const winW = window.innerWidth;
    const top = Math.max(8, Math.min(rect.top, winH - cardH - 16));
    // Prefer the right of the row; on full-width rows that overflows the viewport,
    // so flip to the left side. Clamp to ≥8px so it's never clipped off-screen.
    const wouldOverflowRight = rect.right + 12 + HOVER_CARD_W > winW;
    const left = wouldOverflowRight
      ? Math.max(8, rect.left - 12 - HOVER_CARD_W)
      : rect.right + 12;
    setPos({ top, left });
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
        zIndex: "var(--z-popover)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        padding: "var(--sp-4)",
        width: HOVER_CARD_W,
        boxShadow: "var(--shadow-lg)",
        pointerEvents: "none",
        animation: "fadeIn var(--dur-fast) ease",
      }}
    >
      <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", marginBottom: "var(--sp-3)" }}>
        <ScoreRing score={inst.partner_fit_score} size={52} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-base)", fontWeight: "var(--w-semibold)", lineHeight: "var(--leading-snug)", color: "var(--text-1)" }}>
            {inst.name}
          </div>
          <div style={{ marginTop: "var(--sp-1)" }}>
            <TypeBadge type={inst.type} />
          </div>
        </div>
      </div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-1)" }}>
          <div style={{ flex: 1, height: "var(--bar-h)", background: "var(--border)", borderRadius: "var(--r-full)", overflow: "hidden" }}>
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
            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", flex: 1, minWidth: 0 }}>
              {consortium.map(inst => (
                <button key={inst.id} className="tag" aria-label={`Remove ${inst.name} from consortium`}
                  style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-1)" }}
                  onClick={() => onToggleConsortium(inst)}>
                  {inst.name} ×
                </button>
              ))}
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const rows = consortium.map((inst, i) =>
                  [i + 1, inst.name, inst.country || "", inst.type || "", inst.partner_fit_score.toFixed(0)]
                );
                downloadCsv("consortium.csv", ["Rank", "Name", "Country", "Type", "Score"], rows);
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
        <span className="muted" role="status" aria-live="polite">
          {!loading && `${list.length} institutions`}
        </span>
        {!loading && list.length > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const rows = list.slice(0, 50).map((inst, i) =>
                [i + 1, inst.name, inst.country || "", inst.type || "",
                 inst.partner_fit_score.toFixed(0), inst.eu_projects, inst.recent_works]
              );
              downloadCsv("partners.csv", ["Rank", "Name", "Country", "Type", "Score", "EU Projects", "Works"], rows);
            }}
          >
            Export CSV
          </button>
        )}
      </div>

      {loading && (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading partners…</span>
          <SkeletonList rows={10} />
        </div>
      )}

      {!loading && error && (
        <EmptyState
          icon="⚠️"
          role="alert"
          title="Couldn’t load partners"
          body="The server didn’t respond — it may be waking up. Give it a moment and try again."
          action={<button className="btn btn-primary btn-sm" onClick={() => setReloadKey(k => k + 1)}>Retry</button>}
        />
      )}

      {!loading && !error && list.length === 0 && (
        hasFilters ? (
          <EmptyState
            icon="🔭"
            role="status"
            title="No partners match these filters"
            body="Try widening the country, type, or minimum-score filter to see more institutions."
            action={<button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>}
          />
        ) : (
          <EmptyState
            icon="🔭"
            role="status"
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
              <div className="inst-meta" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap", marginTop: "var(--sp-1)" }}>
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
                className={`consortium-toggle${inConsortium ? " is-active" : ""}`}
                title={inConsortium ? "Remove from consortium" : "Add to consortium"}
                aria-label={inConsortium ? "Remove from consortium" : "Add to consortium"}
                onClick={(e) => { e.stopPropagation(); onToggleConsortium(inst); }}
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
