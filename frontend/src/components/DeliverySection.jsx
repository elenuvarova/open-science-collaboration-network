import { useEffect, useRef, useState } from "react";
import { getDelivery } from "../api";
import { track } from "../analytics";
import EmptyState from "./EmptyState";
import { formatDate } from "./DataStamp";
import "./delivery.css";

const num = (v) => Number(v).toLocaleString("en-GB");

// Order matters: the two outputs a consortium cares about most come first.
const TYPES = [
  { key: "demonstrators", label: "Demonstrators, pilots, prototypes" },
  { key: "datasets", label: "Data sets" },
  { key: "reports", label: "Documents, reports" },
  { key: "other", label: "Other (plans, websites, patents, videos)" },
];

function pct(part, whole) {
  const p = (part / whole) * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
}

// What the EU projects behind an institution have published (CORDIS). Outputs belong to
// the projects, never to one partner in a consortium, and the copy says so.
export default function DeliverySection({ id, topicId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Once per profile open (not per refetch or retry).
  const tracked = useRef(null);
  useEffect(() => {
    if (tracked.current === id) return;
    tracked.current = id;
    track("delivery_viewed", { topic: topicId });
  }, [id, topicId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDelivery(id, topicId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, topicId, reloadKey]);

  return (
    <section className="delivery" aria-labelledby="delivery-title">
      <h3 id="delivery-title" className="subhead">Delivery record</h3>
      <p className="muted delivery-caveat">
        Outputs of EU projects this institution took part in. Deliverables belong to projects, not to individual partners.
      </p>
      {loading ? (
        <EmptyState icon="network" title="Loading the delivery record…" role="status" />
      ) : error ? (
        <EmptyState
          icon="alert"
          role="alert"
          title="Couldn’t load the delivery record."
          action={<button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>}
        />
      ) : (
        <DeliveryBody data={data} topicId={topicId} />
      )}
    </section>
  );
}

function DeliveryBody({ data, topicId }) {
  if (!data.available) {
    // project_output has not been filled yet (first deploy, before the next refresh).
    return <EmptyState icon="download" role="status" title="Output data is loading after the next refresh." />;
  }
  if (data.projects_total === 0) {
    return (
      <p className="muted delivery-empty">
        No EU projects{topicId ? " on this topic" : ""} on record for this institution, so there is no delivery record to show.
      </p>
    );
  }
  if (data.projects_with_outputs === 0) {
    return (
      <p className="muted delivery-empty">
        CORDIS lists no public outputs yet for its {num(data.projects_total)} EU project{data.projects_total === 1 ? "" : "s"}
        {topicId ? " on this topic" : ""}. Recent projects often haven’t published anything.
      </p>
    );
  }

  const { totals } = data;
  const typeTotal = TYPES.reduce((sum, t) => sum + totals[t.key], 0);
  const ppp = data.publications_per_project;
  const updated = formatDate(data.updated_at);

  return (
    <>
      <div className="delivery-stats" role="group" aria-label="Delivery totals">
        <Stat value={num(totals.demonstrators)} label="demonstrators & pilots" />
        <Stat value={num(totals.datasets)} label="datasets" />
        <Stat value={ppp == null ? "–" : ppp.toFixed(1)} label="publications per project" />
      </div>
      <p className="muted delivery-note">
        {num(data.projects_with_demonstrator_or_dataset)} of {num(data.projects_total)} project{data.projects_total === 1 ? "" : "s"}{" "}
        ({Math.round((data.demonstrator_or_dataset_share ?? 0) * 100)}%) list a demonstrator or a dataset.
        {" "}CORDIS lists outputs for {num(data.projects_with_outputs)} of them.
      </p>

      <h4 className="delivery-h">Deliverables by type</h4>
      {typeTotal === 0 ? (
        <p className="muted delivery-empty">No deliverables are listed for these projects, only publications.</p>
      ) : (
        <>
          {/* The bar is a visual summary only; the labelled list below carries every number. */}
          <div className="delivery-bar" aria-hidden="true">
            {TYPES.filter((t) => totals[t.key] > 0).map((t) => (
              <span key={t.key} className={`delivery-seg seg-${t.key}`} style={{ flexGrow: totals[t.key] }} />
            ))}
          </div>
          <ul className="delivery-legend" aria-label={`Deliverables by type, ${num(typeTotal)} in total`}>
            {TYPES.map((t) => (
              <li key={t.key}>
                <span className={`delivery-swatch seg-${t.key}`} aria-hidden="true" />
                <span className="delivery-legend-label">{t.label}</span>
                <span className="delivery-legend-n">{num(totals[t.key])} · {pct(totals[t.key], typeTotal)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="data-stamp delivery-source">
        Source: CORDIS (CC BY 4.0){updated ? `, updated ${updated}` : ""}
        {" · "}
        <a href={`#/method/${topicId ?? ""}`}>How this is counted</a>
      </p>
    </>
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
