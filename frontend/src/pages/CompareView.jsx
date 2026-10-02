import { useEffect, useState } from "react";
import { getEvidence, getInstitution } from "../api";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import TypeBadge, { typeLabel } from "../components/TypeBadge";
import { SCORE_LABELS, SCORE_MAX } from "../components/scoreMeta";
import { countryName, isWidening } from "../horizon";
import { track } from "../analytics";

const NUM = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const round1 = (n) => Math.round((n || 0) * 10) / 10;

// ── Cell renderers ───────────────────────────────────────────────────────────

function Unavailable() {
  return <span className="muted">–<span className="sr-only"> not available</span></span>;
}

// A number, its thin value/max bar, and (when it is the best in its row) bold plus a
// check icon with a screen-reader hint, so "best" never rests on colour alone.
function NumCell({ value, max, best, compact }) {
  if (value == null) return <Unavailable />;
  return (
    <div className="compare-num">
      <span className="compare-val">
        {best ? <strong>{NUM.format(value)}</strong> : NUM.format(value)}
        {max ? <span className="compare-max"> / {max}</span> : null}
        {best && (
          <>
            <Icon name="check" size={12} className="compare-best-icon" />
            <span className="sr-only"> (best in this row)</span>
          </>
        )}
      </span>
      {max && !compact ? (
        <div className="compare-bar" aria-hidden="true">
          <div style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function Country({ code }) {
  if (!code) return <Unavailable />;
  return (
    <span>
      {countryName(code)} <span className="muted">({code})</span>
      {isWidening(code) && (
        <span className="compare-widening"><span className="widening-dot" aria-hidden="true" /> Widening country</span>
      )}
    </span>
  );
}

function CoPartners({ evidence }) {
  if (!evidence) return <Unavailable />;
  const top = evidence.co_partners.slice(0, 3);
  if (!top.length) return <span className="muted">None recorded for this topic</span>;
  return (
    <ol className="compare-partners">
      {top.map((p) => (
        <li key={p.id}>{p.name}{p.country ? <span className="muted"> · {p.country}</span> : null}</li>
      ))}
    </ol>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────
// get(col) is the value compared across columns (null = unknown). kind "num" rows
// also get a best (highest) value. render(col, ctx) draws the cell.

const numRow = (key, label, get, max) => ({
  key, label, kind: "num", get,
  render: (c, { best, compact }) => <NumCell value={get(c)} max={max} best={best} compact={compact} />,
});

const ROWS = [
  numRow("score", "Partner Fit Score", (c) => Math.round(c.inst.partner_fit_score || 0), 100),
  ...Object.keys(SCORE_MAX).map((k) =>
    numRow(k, SCORE_LABELS[k], (c) => round1((c.inst.score_breakdown || {})[k]), SCORE_MAX[k])),
  { key: "type", label: "Type", kind: "cat", get: (c) => typeLabel(c.inst.type), render: (c) => <TypeBadge type={c.inst.type} /> },
  { key: "country", label: "Country", kind: "cat", get: (c) => (c.inst.country || "").toUpperCase(), render: (c) => <Country code={c.inst.country} /> },
  numRow("eu_projects", "EU projects", (c) => c.inst.eu_projects ?? 0),
  numRow("works", "Works", (c) => c.inst.recent_works ?? 0),
  numRow("topic_projects", "EU projects on this topic", (c) => (c.evidence ? c.evidence.totals.projects : null)),
  numRow("coordinator", "As coordinator", (c) => (c.evidence ? c.evidence.totals.coordinator : null)),
  {
    key: "partners", label: "Top 3 co-partners", kind: "list",
    get: (c) => (c.evidence ? c.evidence.co_partners.slice(0, 3).map((p) => p.id).join(",") : null),
    render: (c) => <CoPartners evidence={c.evidence} />,
  },
];

// Differing rows first (NN/g: state the differences, don't make people hunt for them).
function analyse(cols) {
  const rows = ROWS.map((row) => {
    const values = cols.map(row.get);
    const known = values.filter((v) => v != null);
    const same = known.length === values.length && new Set(known).size === 1;
    const best = row.kind === "num" && !same && known.length ? Math.max(...known) : null;
    return { row, values, same, best };
  });
  return { differ: rows.filter((r) => !r.same), same: rows.filter((r) => r.same) };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CompareView({ topicId, topicName, ids = [], consortium = [], onToggleConsortium, onOpenProfile, onBack, onResolve }) {
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const idsKey = ids.join(",");

  useEffect(() => {
    if (ids.length >= 2) track("compare_opened", { topic: topicId, n: ids.length });
  }, [topicId, idsKey]);

  // One institution + one evidence call per column. allSettled: a failed evidence call
  // only blanks that column's evidence rows; a failed institution call drops the column.
  useEffect(() => {
    if (ids.length < 2) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(ids.map((id) => Promise.allSettled([getInstitution(id, topicId), getEvidence(id, topicId)])))
      .then((results) => {
        if (cancelled) return;
        const next = [];
        for (const [inst, ev] of results) {
          if (inst.status === "fulfilled") next.push({ inst: inst.value, evidence: ev.status === "fulfilled" ? ev.value : null });
        }
        setCols(next);
        setLoading(false);
        onResolve?.(next.map((c) => c.inst));
      });
    return () => { cancelled = true; };
  }, [topicId, idsKey, reloadKey]);

  const back = <button type="button" className="back-btn" onClick={onBack}><Icon name="arrow-left" size={14} /> Back to shortlist</button>;

  if (ids.length < 2) return (
    <div>
      {back}
      <EmptyState
        icon="network-node"
        role="status"
        title="Pick 2 to 4 partners to compare"
        body="Tick “Compare” on the Partner Shortlist, then open the comparison from the bar at the bottom."
        action={<button className="btn btn-primary btn-sm" onClick={onBack}>Go to the shortlist</button>}
      />
    </div>
  );

  if (loading) return (
    <div>
      {back}
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading the comparison…</span>
        <div className="card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skel" style={{ height: 14, width: `${90 - i * 8}%`, marginBottom: "var(--sp-4)" }} />
          ))}
        </div>
      </div>
    </div>
  );

  if (cols.length < 2) return (
    <div>
      {back}
      <EmptyState
        icon="alert"
        role="alert"
        title="Couldn’t load these partners"
        body="The server didn’t respond, or some of these partners no longer exist. Try again, or pick them again on the shortlist."
        action={<button className="btn btn-primary btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>}
      />
    </div>
  );

  const { differ, same } = analyse(cols);
  const consortiumIds = new Set(consortium.map((i) => i.id));
  const noEvidence = cols.filter((c) => !c.evidence).map((c) => c.inst.name);
  const missing = ids.length - cols.length;

  return (
    <div className="compare">
      {back}
      <h3 id="compare-title" className="section-title">Compare {cols.length} partners</h3>
      <p className="muted compare-lead">
        {topicName ? `${topicName}. ` : ""}{differ.length} of {ROWS.length} attributes differ and are listed first.
        A check mark and bold type show the highest value in a row.
      </p>

      {missing > 0 && (
        <div className="notice" role="status">
          <Icon name="alert" size={16} /> <span>{missing} {missing === 1 ? "partner" : "partners"} couldn’t be loaded and {missing === 1 ? "is" : "are"} left out.</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </div>
      )}
      {noEvidence.length > 0 && (
        <div className="notice" role="status">
          <Icon name="alert" size={16} /> <span>Project evidence is unavailable for {noEvidence.join(", ")}.</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </div>
      )}

      <div className="compare-scroll" role="region" aria-labelledby="compare-title" tabIndex={0}>
        <table className="compare-table" style={{ "--cols": cols.length }}>
          <caption className="sr-only">
            Side-by-side comparison of {cols.map((c) => c.inst.name).join(", ")}. Attributes that differ come first.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="compare-corner"><span className="sr-only">Attribute</span></th>
              {cols.map(({ inst }) => {
                const inConsortium = consortiumIds.has(inst.id);
                const nameId = `compare-name-${inst.id}`;
                return (
                  <th key={inst.id} scope="col" className="compare-colhead">
                    <div id={nameId} className="compare-name">{inst.name}</div>
                    <div className="compare-actions">
                      {/* aria-describedby adds the institution name, so the visible label stays the accessible name. */}
                      <button
                        type="button"
                        className={`btn btn-sm ${inConsortium ? "btn-secondary" : "btn-primary"}`}
                        aria-describedby={nameId}
                        onClick={() => onToggleConsortium(inst)}
                      >
                        <Icon name={inConsortium ? "check" : "plus"} size={12} />
                        {inConsortium ? "In consortium" : "Add to consortium"}
                        {inConsortium && <span className="sr-only"> (activate to remove)</span>}
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" aria-describedby={nameId} onClick={() => onOpenProfile(inst.id)}>
                        Open profile
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {differ.map(({ row, values, best }) => (
              <tr key={row.key}>
                <th scope="row" className="compare-rowhead">{row.label}</th>
                {cols.map((c, i) => {
                  const isBest = best != null && values[i] === best;
                  return (
                    <td key={c.inst.id} className={isBest ? "is-best" : undefined}>
                      {row.render(c, { best: isBest })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {same.length > 0 && (
        <details className="compare-same">
          <summary>
            <Icon name="chevron-right" size={12} className="compare-same-chevron" />
            Same for all ({same.length})
          </summary>
          <dl>
            {same.map(({ row }) => (
              <div key={row.key} className="compare-same-row">
                <dt>{row.label}</dt>
                <dd>{row.render(cols[0], { best: false, compact: true })}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <p className="muted gap-note">
        “EU projects” and “Works” are the counts behind the score. “On this topic”, “as coordinator” and co-partners come
        from each partner’s evidence section, so they can differ slightly.
      </p>
    </div>
  );
}
