import { useEffect, useRef, useState } from "react";
import { getTies } from "../api";
import { track } from "../analytics";
import EmptyState from "./EmptyState";
import Icon from "./Icon";
import TypeBadge from "./TypeBadge";

const MAX_MEMBERS = 20; // the API's limit on ids
const GRID_MAX = 8;     // beyond this the grid gets unreadable: show a list of pairs
const LIST_STEP = 15;

const SKIP = new Set(["of", "the", "and", "for", "de", "du", "des", "der", "den", "van", "von", "di", "da", "del", "la", "le", "les", "et", "e", "in", "at"]);

// "Katholieke Universiteit Leuven" → "KUL"; made unique per consortium by uniqueInitials.
function initials(name) {
  const words = (name || "").split(/[\s\-–—/,()&]+/).filter(Boolean);
  const sig = words.filter((w) => !SKIP.has(w.toLowerCase()));
  const pick = (sig.length ? sig : words).slice(0, 3);
  const out = pick.map((w) => [...w][0].toUpperCase()).join("");
  return out.length > 1 ? out : [...(words[0] || "?")].slice(0, 2).join("").toUpperCase();
}

function uniqueInitials(members) {
  const seen = {};
  return members.map((m) => {
    const s = initials(m.name);
    seen[s] = (seen[s] || 0) + 1;
    return seen[s] > 1 ? `${s}${seen[s]}` : s;
  });
}

// The ETL stores one edge per pair. A "coauthor" edge's weight is co-authored works
// plus 0.5 per shared EU project, so it is a strength, never a clean count of works.
// A "project" edge (no co-authorship) counts shared EU projects.
const fmtW = (n) => String(Math.round(n * 10) / 10);
const worksText = (n) => `co-authorship tie, strength ${fmtW(n)} (may include shared EU projects)`;
const projectsText = (n) => (Number.isInteger(n) ? `${n} shared EU ${n === 1 ? "project" : "projects"}` : `EU project tie, strength ${fmtW(n)}`);

function describeTie(p) {
  const parts = [];
  if (p.coauthor > 0) parts.push(worksText(p.coauthor));
  if (p.project > 0) parts.push(projectsText(p.project));
  return parts.join(", ");
}

const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function Grid({ members, tied, maxW }) {
  const ini = uniqueInitials(members);
  return (
    <>
      <div className="ties-scroll" role="region" aria-label="Ties between partners, as a grid" tabIndex={0}>
        <table className="ties-grid">
          <caption className="sr-only">
            Recorded ties between each pair of partners. An empty cell means no recorded tie, which is unknown rather than none.
          </caption>
          <thead>
            <tr>
              <td><span className="sr-only">Partner</span></td>
              {members.map((m, j) => (
                <th key={m.id} scope="col" title={m.name}>
                  <span aria-hidden="true">{ini[j]}</span>
                  <span className="sr-only">{m.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((row, i) => (
              <tr key={row.id}>
                <th scope="row" className="ties-rowhead" title={row.name}>
                  <b>{ini[i]}</b> <span className="ties-rowname">{row.name}</span>
                </th>
                {members.map((col, j) => {
                  if (i === j) {
                    return <td key={col.id} className="ties-cell is-self"><span className="sr-only">Same partner</span></td>;
                  }
                  const p = tied.get(pairKey(row.id, col.id));
                  const names = `${row.name} and ${col.name}`;
                  if (!p) {
                    const text = `${names}: no recorded tie`;
                    return <td key={col.id} className="ties-cell is-none" title={`${text} (unknown, not none)`}><span className="sr-only">{text}</span></td>;
                  }
                  const text = `${names}: ${describeTie(p)}`;
                  // sqrt keeps a single shared work visible next to a very strong pair.
                  const pct = Math.round(14 + 46 * Math.sqrt(p.weight / maxW));
                  return (
                    <td key={col.id} className="ties-cell has-tie" style={{ "--p": pct }} title={text}>
                      <span aria-hidden="true">{fmtW(p.weight)}</span>
                      <span className="sr-only">{text}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted ties-legend">
        <span className="ties-swatch is-none" aria-hidden="true" /> No recorded tie
        <span className="ties-swatch is-weak" aria-hidden="true" /> Weaker
        <span className="ties-swatch is-strong" aria-hidden="true" /> Stronger
        · The number is the tie strength: each co-authored work counts 1, each shared EU project 0.5
        (or 1 when the pair never co-authored).
      </p>
    </>
  );
}

function PairList({ pairs, nameOf, maxW }) {
  const [shown, setShown] = useState(LIST_STEP);
  return (
    <>
      <ol className="ties-pairs" aria-label="Pairs with a recorded tie, strongest first">
        {pairs.slice(0, shown).map((p) => (
          <li key={`${p.a}-${p.b}`} className="ties-pair">
            <div className="ties-pair-main">
              <div className="evidence-title">{nameOf(p.a)} · {nameOf(p.b)}</div>
              <div className="inst-meta">{describeTie(p)}</div>
            </div>
            <div className="ties-pair-strength">
              <span className="evidence-weight" aria-label={`tie strength ${fmtW(p.weight)}`}>{fmtW(p.weight)}</span>
              <div className="compare-bar" aria-hidden="true"><div style={{ width: `${Math.min(100, (p.weight / maxW) * 100)}%` }} /></div>
            </div>
          </li>
        ))}
      </ol>
      {pairs.length > shown && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShown((n) => n + LIST_STEP)}>
          Show more ({pairs.length - shown} left)
        </button>
      )}
    </>
  );
}

// "Who already works together": recorded ties between the members of the consortium, the
// members with no tie at all, and outside institutions that could bridge them.
// Self-contained so GapView only renders it.
export default function TiesMatrix({ topicId, consortium = [], onToggleConsortium }) {
  const members = consortium.slice(0, MAX_MEMBERS);
  const idsKey = members.map((m) => m.id).sort((a, b) => a - b).join(",");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState("grid");
  const [announce, setAnnounce] = useState("");
  const headingRef = useRef(null);

  useEffect(() => {
    if (!topicId || members.length < 2) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    getTies(topicId, idsKey.split(",").map(Number))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId, idsKey, reloadKey]);

  if (!members.length) return null;

  const names = new Map(members.map((m) => [m.id, m.name]));
  const nameOf = (id) => names.get(id) || `Partner ${id}`;

  function add(b) {
    // Same shape the shortlist stores, so the consortium list and CSV keep working.
    onToggleConsortium({
      id: b.id, name: b.name, country: b.country, type: b.type,
      partner_fit_score: b.partner_fit_score, eu_projects: b.eu_projects,
    });
    track("tie_bridge_added", { topic: topicId, connects: b.connects.length });
    setAnnounce(`${b.name} added to your consortium.`);
    // The row disappears on refetch, which would drop keyboard focus: park it on the heading.
    headingRef.current?.focus();
  }

  let body;
  if (members.length < 2) {
    body = <p className="muted">Add at least two partners to see who already works together.</p>;
  } else if (loading) {
    body = (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading ties…</span>
        {[1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 40, marginBottom: "var(--sp-2)", borderRadius: "var(--r-md)" }} />)}
      </div>
    );
  } else if (error || !data) {
    body = (
      <EmptyState
        icon="alert"
        role="alert"
        title="Couldn’t load the ties"
        body="The server didn’t respond. Give it a moment and try again."
        action={<button className="btn btn-primary btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>}
      />
    );
  } else {
    const tied = new Map(data.pairs.map((p) => [pairKey(p.a, p.b), p]));
    const maxW = Math.max(...data.pairs.map((p) => p.weight), 1);
    const useGrid = members.length <= GRID_MAX && view === "grid";
    const isolated = data.isolated.filter((id) => names.has(id));
    const weak = new Set(data.weak);
    const isolatedSet = new Set(data.isolated);
    const total = members.length * (members.length - 1) / 2;
    body = (
      <>
        <div className="ties-bar">
          <p className="muted" role="status" aria-live="polite">
            {data.pairs.length} of {total} {total === 1 ? "pair has" : "pairs have"} a recorded tie.
          </p>
          {members.length <= GRID_MAX && data.pairs.length > 0 && (
            <div className="segmented" role="group" aria-label="Show ties as">
              {[["grid", "Grid"], ["list", "List"]].map(([v, label]) => (
                <button key={v} type="button" className="segmented-btn" aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
              ))}
            </div>
          )}
        </div>

        {data.pairs.length === 0 ? (
          <EmptyState
            icon="network-node"
            role="status"
            title="No recorded ties between these partners"
            body="That doesn’t mean they have never worked together: a missing tie is unknown, not none."
          />
        ) : useGrid ? (
          <Grid members={members} tied={tied} maxW={maxW} />
        ) : (
          <PairList pairs={data.pairs} nameOf={nameOf} maxW={maxW} />
        )}

        <h4 className="evidence-h">Isolated partners</h4>
        {isolated.length === 0 ? (
          <p className="muted evidence-empty"><Icon name="check" size={14} /> Every partner has at least one recorded tie.</p>
        ) : (
          <>
            <p className="muted evidence-empty">No recorded tie to any other partner in your consortium.</p>
            <ul className="ties-chips">
              {isolated.map((id) => <li key={id} className="tag">{nameOf(id)}</li>)}
            </ul>
          </>
        )}

        {data.bridges.length > 0 && (
          <>
            <h4 className="evidence-h">Could connect your partners</h4>
            <p className="muted evidence-empty">
              Not in your consortium, but tied to two or more of your partners, including one that has no or few ties so far.
            </p>
            <ul className="evidence-list">
              {data.bridges.map((b) => (
                <li key={b.id} className="evidence-item">
                  <div className="evidence-main">
                    <div className="evidence-title">{b.name}</div>
                    <div className="inst-meta">
                      {[b.country, "Tied to " + b.connects.map((l) =>
                        nameOf(l.member_id) + (isolatedSet.has(l.member_id) ? " (no ties yet)" : weak.has(l.member_id) ? " (weakly tied)" : "")
                      ).join(", ")].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <TypeBadge type={b.type} />
                  {onToggleConsortium && (
                    <button className="btn btn-ghost btn-sm" onClick={() => add(b)} aria-label={`Add ${b.name} to consortium`}>
                      <Icon name="plus" size={12} /> Add
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

  return (
    <section className="card ties" aria-labelledby="ties-title" aria-busy={loading && members.length >= 2}>
      <h3 id="ties-title" className="subhead" tabIndex={-1} ref={headingRef}>Who already works together</h3>
      <p className="ties-note">
        <strong>Missing tie = unknown, not none.</strong> The graph only covers this topic’s top institutions, so two
        partners can work together without it showing here.
      </p>
      {consortium.length > MAX_MEMBERS && (
        <p className="muted evidence-empty">Showing the first {MAX_MEMBERS} of {consortium.length} partners.</p>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {body}
    </section>
  );
}
