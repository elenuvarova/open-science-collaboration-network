import { useEffect, useState } from "react";
import { getBenchmark, getInstitutions } from "../api";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import TypeBadge from "../components/TypeBadge";
import { ASSOCIATED_LIST_URL, checkEligibility, countryName, isWidening } from "../horizon";
import { track } from "../analytics";
import SuggestedPartners from "../components/SuggestedPartners";
import TiesMatrix from "../components/TiesMatrix";
import CopyButton from "../components/CopyButton";
import Segmented from "../components/Segmented";

// Roles are inferred from each organisation's ROR type — what kind of organisation
// it is, not what it would do in a project. The UI says so; the mapping is the
// whole rule, so there's nothing hidden behind the verdicts.
const ROLES = [
  { key: "academic",  label: "Academic research",       types: ["education"] },
  { key: "facility",  label: "Research infrastructure", types: ["facility", "archive"] },
  { key: "industry",  label: "Industry",                types: ["company"] },
  { key: "public",    label: "Public authority",        types: ["government"] },
  { key: "civil",     label: "Civil society",           types: ["nonprofit"] },
  { key: "health",    label: "Health & care",           types: ["healthcare"] },
];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function poolDepth(count) {
  if (count >= 20) return { level: "strong", label: "Deep pool", glyph: "check" };
  if (count >= 5) return { level: "medium", label: "Some", glyph: "alert" };
  return { level: "weak", label: "Scarce", glyph: "close" };
}

function countByRole(institutions) {
  const byType = {};
  for (const inst of institutions) {
    const t = (inst.type || "unknown").toLowerCase();
    byType[t] = (byType[t] || 0) + 1;
  }
  return ROLES.map((r) => ({ ...r, count: r.types.reduce((s, t) => s + (byType[t] || 0), 0) }));
}

function RoleGrid({ institutions, isConsortium }) {
  return (
    <div className="gap-grid">
      {countByRole(institutions).map((role) => {
        const v = isConsortium
          ? (role.count > 0
              ? { level: "strong", label: "Covered", glyph: "check" }
              : { level: "weak", label: "Missing", glyph: "close" })
          : poolDepth(role.count);
        return (
          <div className="gap-card" key={role.key}>
            <div className="gap-card-title">{role.label}</div>
            <div className={`gap-card-status gap-${v.level}`}>{v.label} <Icon key={v.glyph} name={v.glyph} size={16} draw /></div>
            <div className="muted gap-card-count">
              {plural(role.count, "institution", "institutions")}
              {isConsortium ? " in your consortium" : " in this network"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EligibilityCard({ consortium }) {
  const { ok, checks, outside } = checkEligibility(consortium);
  return (
    <section className="card gap-panel" aria-labelledby="elig-h">
      <div className="gap-panel-head">
        <h3 id="elig-h" className="eyebrow">Horizon eligibility check</h3>
        <span className={`gap-verdict ${ok ? "gap-strong" : "gap-weak"}`}>
          {ok ? "Meets the minimum" : "Not yet"} <Icon key={ok ? "ok" : "no"} name={ok ? "check" : "alert"} size={16} draw={ok} />
        </span>
      </div>
      <ul className="check-list">
        {checks.map((c) => (
          <li key={c.key} className={c.ok ? "is-ok" : "is-missing"}>
            <Icon key={c.ok ? "ok" : "no"} name={c.ok ? "check" : "close"} size={16} draw />
            <span className="sr-only">{c.ok ? "Met:" : "Not met:"}</span>
            <span>{c.label}</span>
            <span className="muted check-detail">{c.detail}</span>
          </li>
        ))}
      </ul>
      {outside.length > 0 && (
        <p className="muted gap-note">
          {outside.map(countryName).join(", ")} {outside.length === 1 ? "is" : "are"} outside the EU and
          associated countries. These partners can join but usually don’t count towards the minimum or receive funding.
        </p>
      )}
      <p className="muted gap-note">
        Indicative check for Research &amp; Innovation and Innovation Actions. It can’t verify that partners are
        independent of each other, and some calls set stricter rules. Canada, South Korea and New Zealand
        are associated for Pillar II (the clusters) only. <a href={ASSOCIATED_LIST_URL} target="_blank" rel="noreferrer">Current list of associated countries <Icon name="external" size={12} /></a>
      </p>
    </section>
  );
}

function BenchmarkCard({ topicId, countries, isConsortium }) {
  const [bm, setBm] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getBenchmark(topicId).then((d) => { if (!cancelled) setBm(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [topicId]);

  const widening = countries.filter(isWidening);
  const hasBenchmark = bm && bm.projects > 0 && bm.median_countries != null;
  const mine = countries.length;
  const scaleMax = Math.max(mine, hasBenchmark ? bm.p75_countries : 0, 1);
  const pct = (v) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  return (
    <section className="card gap-panel" aria-labelledby="bench-h">
      <div className="gap-panel-head">
        <h3 id="bench-h" className="eyebrow">Countries{hasBenchmark ? " vs funded consortia" : ""}</h3>
      </div>
      {hasBenchmark && (
        <>
          <p className="gap-bench-lead">
            <span className="gap-bench-num">{Math.round(bm.median_countries)}</span>
            countries is the median across {plural(bm.projects, "multi-country EU project", "multi-country EU projects")} on
            this topic that institutions in this network took part in. The middle half span <span className="nowrap">{Math.round(bm.p25_countries)}–{Math.round(bm.p75_countries)}</span>.
          </p>
          {isConsortium && (
            <div className="bench-bars" aria-hidden="true">
              <div className="bench-row"><span>Typical</span><div className="bench-track"><div className="bench-range grow-x" style={{ left: pct(bm.p25_countries), width: `calc(${pct(bm.p75_countries)} - ${pct(bm.p25_countries)})` }} /><div className="bench-mark rise-in" style={{ left: pct(bm.median_countries) }} /></div></div>
              <div className="bench-row"><span>Yours</span><div className="bench-track"><div className="bench-fill grow-x" style={{ width: pct(mine), "--i": 3 }} /></div><b>{mine}</b></div>
            </div>
          )}
          {Object.keys(bm.coordinator_types).length > 0 && (
            <p className="muted gap-note gap-coord">
              {bm.coordinators_identified ? `Of the ${bm.coordinators_identified} coordinators we could identify:` : "Coordinators we could identify:"}{" "}
              {Object.entries(bm.coordinator_types).slice(0, 3).map(([t, share]) => (
                <span key={t} className="gap-coord-item"><TypeBadge type={t} /> {Math.round(share * 100)}%</span>
              ))}
            </p>
          )}
        </>
      )}
      <div className="gap-countries">
        {countries.length
          ? countries.map((c) => (
              <span className={`tag${isWidening(c) ? " tag-widening" : ""}`} key={c} title={countryName(c)}>
                {c}{isWidening(c) && <span className="sr-only"> (widening country)</span>}
              </span>
            ))
          : <span className="muted">No countries yet</span>}
      </div>
      {widening.length > 0 && (
        <p className="muted gap-note">
          <span className="tag tag-widening" aria-hidden="true">{widening[0]}</span> Highlighted:{" "}
          {plural(widening.length, "widening country", "widening countries")}. Evaluators often welcome them, and they
          open up the Widening calls.
        </p>
      )}
    </section>
  );
}

export default function GapView({ topicId, consortium = [], onClearConsortium, onToggleConsortium }) {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [mode, setMode] = useState(consortium.length ? "consortium" : "network");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!topicId) return;
    setLoading(true);
    setError(false);
    let cancelled = false;
    getInstitutions({ topic: topicId, limit: 200 })
      .then((d) => { if (!cancelled) setInstitutions(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId, reloadKey]);

  // Follow the consortium: switch to it when the first partner is added, back when it empties.
  useEffect(() => {
    setMode(consortium.length > 0 ? "consortium" : "network");
  }, [consortium.length > 0]);

  async function copyShareLink() {
    const ids = consortium.map((i) => i.id).join(",");
    const url = `${window.location.origin}/app#/gaps/${topicId}?c=${ids}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      track("consortium_shared", { topic: topicId, size: consortium.length });
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  if (loading) return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading consortium gaps…</span>
      <div className="gap-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="gap-card" key={i}>
            <div className="skel" style={{ height: 10, width: "60%", marginBottom: "var(--sp-3)" }} />
            <div className="skel" style={{ height: 28, width: "80%", marginBottom: "var(--sp-2)" }} />
            <div className="skel" style={{ height: 10, width: "40%" }} />
          </div>
        ))}
      </div>
    </div>
  );

  if (error && consortium.length === 0) return (
    <EmptyState
      icon="alert"
      role="alert"
      title="Couldn’t load network data"
      body="The server didn’t respond — it may be waking up. Give it a moment and try again."
      action={<button className="btn btn-primary btn-sm" onClick={() => setReloadKey(k => k + 1)}>Retry</button>}
    />
  );

  const isConsortium = mode === "consortium";
  const active = isConsortium ? consortium : institutions;
  const countries = [...new Set(active.map((i) => (i.country || "").toUpperCase()).filter(Boolean))].sort();
  const label = isConsortium
    ? `${plural(consortium.length, "partner", "partners")} selected`
    : `${plural(institutions.length, "top-scored institution", "top-scored institutions")} in this network`;

  return (
    <div>
      <div className="gap-toolbar">
        <Segmented
          label="Show roles for"
          value={mode}
          onChange={setMode}
          options={[["network", "Full network"], ["consortium", `My consortium${consortium.length ? ` (${consortium.length})` : ""}`]]}
        />
        <p className="muted" style={{ margin: 0 }} role="status" aria-live="polite">{label}</p>
        {isConsortium && consortium.length > 0 && (
          <div className="gap-toolbar-actions">
            <CopyButton copied={copied} onClick={copyShareLink} idle="Copy share link" done="Link copied" />
            {onClearConsortium && <button className="btn btn-ghost btn-sm" onClick={onClearConsortium}>Clear</button>}
          </div>
        )}
      </div>

      {isConsortium && consortium.length === 0 ? (
        <EmptyState
          icon="plus"
          role="status"
          title="Your consortium is empty"
          body="Add partners with the + button on the Partner Shortlist. This view then checks roles, Horizon eligibility and country spread."
        />
      ) : (
        <>
          <RoleGrid institutions={active} isConsortium={isConsortium} />
          <p className="muted gap-note gap-roles-note">
            Roles are indicative. They come from each organisation’s ROR type (education, company, government…), not from
            what it would do in your project.
          </p>
          <div className="gap-panels">
            {isConsortium && <EligibilityCard consortium={consortium} />}
            <BenchmarkCard topicId={topicId} countries={countries} isConsortium={isConsortium} />
          </div>
        </>
      )}
      {mode === "consortium" && <SuggestedPartners topicId={topicId} consortium={consortium} onToggleConsortium={onToggleConsortium} />}
      {mode === "consortium" && <TiesMatrix topicId={topicId} consortium={consortium} onToggleConsortium={onToggleConsortium} />}
    </div>
  );
}
