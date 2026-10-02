import { useEffect, useRef, useState } from "react";
import { getInstitutions } from "../api";
import InstitutionProfile from "./InstitutionProfile";
import TypeBadge from "../components/TypeBadge";
import ScoreRing from "../components/ScoreRing";
import SkeletonList from "../components/SkeletonList";
import EmptyState from "../components/EmptyState";
import { SCORE_LABELS, SCORE_MAX } from "../components/scoreMeta";
import DataStamp from "../components/DataStamp";
import { ASSOCIATED_COUNTRIES, EU_MEMBER_STATES, WIDENING_COUNTRIES, countryName, isWidening } from "../horizon";
import { track } from "../analytics";
import Icon from "../components/Icon";

// Country filter: two Horizon groupings first, then every Member State and
// associated country by name. Groups are sent as ?countries=… to the API.
const COUNTRY_GROUPS = {
  eu: { label: "EU Member States", codes: EU_MEMBER_STATES },
  widening: { label: "Widening countries", codes: WIDENING_COUNTRIES },
};
const COUNTRIES = [...EU_MEMBER_STATES, ...ASSOCIATED_COUNTRIES]
  .map((c) => ({ code: c, name: countryName(c) }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Re-weighting: each breakdown value is points out of SCORE_MAX[k], so value/max is
// the 0–1 signal. A custom score is the weighted mean of those signals × 100.
function reweighted(inst, weights) {
  const bd = inst.score_breakdown || {};
  let sum = 0, wsum = 0;
  for (const k of Object.keys(SCORE_MAX)) {
    const w = weights[k] || 0;
    sum += ((bd[k] || 0) / SCORE_MAX[k]) * w;
    wsum += w;
  }
  return wsum ? (sum / wsum) * 100 : 0;
}

function WeightsPanel({ weights, onChange, onReset }) {
  return (
    <fieldset className="weights card">
      <legend className="eyebrow">Your weights</legend>
      <p className="muted weights-note">Drag to change what matters for this call. The list re-ranks on the spot; nothing is saved.</p>
      <div className="weights-grid">
        {Object.keys(SCORE_MAX).map((k) => (
          <label key={k} className="weight">
            <span className="weight-label">{SCORE_LABELS[k]}</span>
            <input type="range" min={0} max={40} step={5} value={weights[k]}
              onChange={(e) => onChange({ ...weights, [k]: Number(e.target.value) })}
              aria-valuetext={`${weights[k]} points`} />
            <span className="weight-value">{weights[k]}</span>
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>Reset to default</button>
    </fieldset>
  );
}
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

const MAX_COMPARE = 4; // keep in sync with MAX_COMPARE in App.jsx

// Compare tray: sticks to the bottom of the viewport while 2+ partners are picked.
function CompareTray({ compare, onClear, onOpen }) {
  const full = compare.length >= MAX_COMPARE;
  return (
    <section className="compare-tray" aria-label="Partners to compare">
      <div className="compare-tray-main">
        <ul className="compare-tray-names">
          {compare.map((c) => <li key={c.id} className="tag" title={c.name}>{c.name || `Partner ${c.id}`}</li>)}
        </ul>
        {/* The disabled checkboxes point here, so the reason is read out with them. */}
        <p id="compare-limit-reason" className="compare-tray-note muted">
          {full ? "Limit reached: you can compare up to 4 partners. Untick one to pick another." : `${compare.length} of ${MAX_COMPARE} selected`}
        </p>
      </div>
      <div className="compare-tray-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>Clear</button>
        <button type="button" className="btn btn-primary" onClick={onOpen}>Compare ({compare.length})</button>
      </div>
    </section>
  );
}

export default function Shortlist({ topicId, consortium = [], onToggleConsortium, onGoToGaps, onGoToPipeline, profileId = null, onOpenProfile, onCloseProfile, compare = [], onToggleCompare, onClearCompare, onOpenCompare }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("");
  const [type, setType] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [weights, setWeights] = useState(null); // null = server score
  const [showWeights, setShowWeights] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const hoverTimer = useRef(null);

  useEffect(() => {
    if (!topicId) return;
    setLoading(true);
    setError(false);
    const params = { topic: topicId, limit: 100 };
    if (COUNTRY_GROUPS[country]) params.countries = COUNTRY_GROUPS[country].codes.join(",");
    else if (country) params.country = country;
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
  const compareIds = new Set(compare.map(c => c.id));
  const compareFull = compare.length >= MAX_COMPARE;
  const isDefault = weights != null && Object.keys(SCORE_MAX).every((k) => weights[k] === SCORE_MAX[k]);
  const custom = weights != null && !isDefault;
  const rows = custom
    ? list.map((i) => ({ ...i, partner_fit_score: reweighted(i, weights) }))
        .sort((a, b) => b.partner_fit_score - a.partner_fit_score)
    : list;

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
          {(onGoToGaps || onGoToPipeline) && (
            <div style={{ marginTop: "var(--sp-2)" }}>
              {onGoToGaps && (
                <button className="btn btn-ghost btn-sm" onClick={onGoToGaps}>
                  → Check role coverage
                </button>
              )}
              {onGoToPipeline && (
                <button className="btn btn-ghost btn-sm" onClick={onGoToPipeline}>
                  → Track outreach
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="filter-bar">
        <select className="filter-select" aria-label="Filter by country" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          <optgroup label="Groups">
            {Object.entries(COUNTRY_GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
          </optgroup>
          <optgroup label="Member States and associated countries">
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </optgroup>
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
        <button type="button" className={`btn btn-sm ${custom ? "btn-primary" : "btn-secondary"}`}
          aria-expanded={showWeights} onClick={() => {
            if (!showWeights) track("weights_opened", { topic: topicId });
            setShowWeights((v) => !v);
            if (weights == null) setWeights({ ...SCORE_MAX });
          }}>
          <Icon name="filter" size={14} /> Weights{custom ? " · custom" : ""}
        </button>
        <span className="muted" role="status" aria-live="polite">
          {!loading && `${list.length} ${list.length === 1 ? "institution" : "institutions"}`}
          {!loading && custom && " · re-ranked with your weights"}
        </span>
        {!loading && list.length > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const csvRows = rows.slice(0, 50).map((inst, i) =>
                [i + 1, inst.name, inst.country || "", inst.type || "",
                 inst.partner_fit_score.toFixed(0), inst.eu_projects, inst.recent_works]
              );
              track("csv_exported", { topic: topicId, rows: csvRows.length, custom_weights: custom });
              downloadCsv("partners.csv", ["Rank", "Name", "Country", "Type", "Score", "EU Projects", "Works"], csvRows);
            }}
          >
            Export CSV
          </button>
        )}
        <DataStamp topicId={topicId} />
      </div>

      {showWeights && weights && (
        <WeightsPanel
          weights={weights}
          onChange={(w) => { setWeights(w); }}
          onReset={() => { setWeights(null); setShowWeights(false); track("weights_reset", { topic: topicId }); }}
        />
      )}

      {loading && (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading partners…</span>
          <SkeletonList rows={10} />
        </div>
      )}

      {!loading && error && (
        <EmptyState
          icon="alert"
          role="alert"
          title="Couldn’t load partners"
          body="The server didn’t respond — it may be waking up. Give it a moment and try again."
          action={<button className="btn btn-primary btn-sm" onClick={() => setReloadKey(k => k + 1)}>Retry</button>}
        />
      )}

      {!loading && !error && list.length === 0 && (
        hasFilters ? (
          <EmptyState
            icon="search"
            role="status"
            title="No partners match these filters"
            body="Try widening the country, type, or minimum-score filter to see more institutions."
            action={<button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>}
          />
        ) : (
          <EmptyState
            icon="search"
            role="status"
            title="No partners yet for this topic"
            body="Collaboration data for this topic isn’t available yet. Check back shortly."
          />
        )
      )}

      {!loading && !error && rows.map((inst, i) => {
        const inConsortium = consortiumIds.has(inst.id);
        return (
          <div
            key={inst.id}
            className={`inst-row${inConsortium ? " in-consortium" : ""}`}
            // Mouse users can click anywhere on the row; keyboard and screen-reader
            // users get the name button below (a row-as-button can't contain the
            // consortium toggle — nested interactive controls, WCAG 4.1.2).
            onClick={() => onOpenProfile(inst.id)}
            onMouseEnter={(e) => onMouseEnter(inst, e.currentTarget)}
            onMouseLeave={onMouseLeave}
          >
            <span className="inst-rank">{i + 1}</span>
            <div className="inst-info">
              <button type="button" className="inst-name inst-name-btn" onClick={(e) => { e.stopPropagation(); onOpenProfile(inst.id); }}>{inst.name}</button>
              <div className="inst-meta" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap", marginTop: "var(--sp-1)" }}>
                <TypeBadge type={inst.type} />
                <span title={countryName(inst.country)}>{inst.country}{isWidening(inst.country) && <><span className="widening-dot" title="Widening country" aria-hidden="true" /><span className="sr-only"> (widening country)</span></>}</span>
                <span>·</span>
                <span>{fmt(inst.recent_works)} works</span>
                {inst.eu_projects > 0 && <><span>·</span><span>{inst.eu_projects} EU projects</span></>}
              </div>
            </div>
            <span className={`score-pill ${scoreClass(inst.partner_fit_score)}`}>
              {inst.partner_fit_score.toFixed(0)}
            </span>
            {onToggleCompare && (() => {
              const picked = compareIds.has(inst.id);
              const blocked = compareFull && !picked;
              return (
                // The row opens the profile on click, so the label must not bubble.
                <label
                  className={`compare-check${blocked ? " is-disabled" : ""}`}
                  title={blocked ? "You can compare up to 4 partners. Untick one to pick another." : undefined}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    id={`compare-${inst.id}`}
                    type="checkbox"
                    checked={picked}
                    disabled={blocked}
                    aria-label={`Compare ${inst.name}`}
                    aria-describedby={blocked ? "compare-limit-reason" : undefined}
                    onChange={() => onToggleCompare(inst)}
                  />
                  <span className="compare-check-text" aria-hidden="true">Compare</span>
                </label>
              );
            })()}
            {onToggleConsortium && (
              <button
                className={`consortium-toggle${inConsortium ? " is-active" : ""}`}
                title={inConsortium ? "Remove from consortium" : "Add to consortium"}
                aria-label={inConsortium ? "Remove from consortium" : "Add to consortium"}
                onClick={(e) => { e.stopPropagation(); onToggleConsortium(inst); }}
              >
                <Icon name={inConsortium ? "check" : "plus"} size={14} />
              </button>
            )}
          </div>
        );
      })}

      <HoverCard inst={hovered} anchor={hoverAnchor} />

      {onToggleCompare && (
        <>
          {/* Always mounted so a screen reader hears the count change (the tray itself only exists from 2 picks). */}
          <p className="sr-only" role="status" aria-live="polite">
            {compare.length ? `${compare.length} of ${MAX_COMPARE} partners selected for comparison.` : ""}
          </p>
          {compare.length >= 2 && (
            <CompareTray
              compare={compare}
              onClear={() => {
                // The tray unmounts, so hand keyboard focus back to the row the user last ticked.
                const last = compare[compare.length - 1].id;
                onClearCompare();
                requestAnimationFrame(() => document.getElementById(`compare-${last}`)?.focus());
              }}
              onOpen={onOpenCompare}
            />
          )}
        </>
      )}
    </div>
  );
}
