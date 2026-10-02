import { useEffect, useState } from "react";
import { getCalls } from "../api";
import { track } from "../analytics";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import { ACTION_LABELS, daysLabel, daysUntil, formatDate, formatEuro, urgency } from "../components/callUtils";
import "../components/calls.css";

// A 0..1 heuristic score reads as false precision ("100% match"), so show a band.
function matchLabel(score) {
  return score >= 0.7 ? "Strong match" : score >= 0.5 ? "Good match" : "Possible match";
}

function CallCard({ call, topicId, onBuild }) {
  // Recomputed locally so the count is right even if the response is hours old.
  const days = daysUntil(call.next_deadline);
  const level = urgency(days);
  const chip = level === "urgent" ? " is-urgent" : level === "soon" ? " is-soon" : "";
  const budget = formatEuro(call.budget_eur);
  const perProject = formatEuro(call.max_contribution_eur);
  const more = call.deadlines.length - 1;
  const titleId = `call-${call.identifier}`;

  return (
    <li>
      <article className="card call-card" aria-labelledby={titleId}>
        <div className="call-head">
          <span className="call-id">{call.identifier}</span>
          {call.type_of_action && (
            <span className="call-type">
              <abbr title={ACTION_LABELS[call.type_of_action] || call.type_of_action}>{call.type_of_action}</abbr>
            </span>
          )}
          <span className={`call-status${call.status === "open" ? " is-open" : ""}`}>
            {call.status === "open" ? "Open" : "Forthcoming"}
          </span>
          <span className="call-match" title={`Text similarity to this topic: ${Math.round(call.match_score * 100)}/100`}>
            {matchLabel(call.match_score)}
          </span>
        </div>

        <h3 className="call-title" id={titleId}>{call.title}</h3>

        <dl className="call-facts">
          <div>
            <dt>Deadline</dt>
            <dd>
              {formatDate(call.next_deadline)}
              {days != null && <span className={`days-chip${chip}`}>{daysLabel(days)}</span>}
              {more > 0 && (
                <span className="sub">{more} later {more === 1 ? "deadline" : "deadlines"} (next: {formatDate(call.deadlines[1])})</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Budget</dt>
            <dd>
              {budget ?? <span className="muted">Not published</span>}
              {budget && perProject && <span className="sub">up to {perProject} per project</span>}
            </dd>
          </div>
        </dl>

        <div className="call-actions">
          <button type="button" className="btn btn-primary" onClick={() => onBuild(call)}>
            Build consortium for this call
          </button>
          <a
            className="btn btn-secondary"
            href={call.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${call.identifier} on the EU Funding & Tenders Portal (opens in a new tab)`}
            onClick={() => track("call_opened", { topic: topicId })}
          >
            Open on EU portal <Icon name="external" size={14} />
          </a>
        </div>
      </article>
    </li>
  );
}

export default function CallsView({ topicId, topicName, onBuildConsortium }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);
    getCalls(topicId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId, reloadKey]);

  const retry = <button type="button" className="btn btn-primary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>;

  if (loading) return (
    <EmptyState
      icon="search"
      role="status"
      title="Loading live calls…"
      body="Reading the EU Funding & Tenders Portal. The first load can take a few seconds."
    />
  );

  if (error) return (
    <EmptyState
      icon="alert"
      role="alert"
      title="Couldn’t load calls"
      body="The server didn’t respond — it may be waking up. Give it a moment and try again."
      action={retry}
    />
  );

  const calls = data?.calls || [];

  // stale + nothing cached: the portal was unreachable and we have no copy to show.
  if (calls.length === 0 && data?.stale) return (
    <EmptyState
      icon="alert"
      role="alert"
      title="The EU portal can’t be reached right now"
      body="We couldn’t read the list of open calls. Try again in a few minutes."
      action={retry}
    />
  );

  if (calls.length === 0) return (
    <EmptyState
      icon="search"
      role="status"
      title="No open calls match this topic right now"
      body={`There are no open or forthcoming Horizon Europe topics close enough to “${topicName || "this topic"}”. Try another topic, or check back after the next work programme update.`}
    />
  );

  return (
    <div className="calls-page">
      <div className="calls-intro">
        <p className="body-text">
          Open and forthcoming Horizon Europe topics that fit {topicName ? <strong>{topicName}</strong> : "this topic"}, nearest deadline first.
          Pick one and build the consortium around it.
        </p>
      </div>

      {data.stale && (
        <div className="calls-notice" role="status">
          <Icon name="alert" size={16} />
          <span>
            The EU portal couldn’t be reached, so this is a saved copy
            {data.fetched_at ? ` from ${formatDate(data.fetched_at)}` : ""}. Deadlines may have changed — check the portal before relying on them.
          </span>
        </div>
      )}

      <p className="muted calls-count" role="status">
        {calls.length} matching {calls.length === 1 ? "call" : "calls"}
      </p>

      <ul className="calls-list">
        {calls.map((c) => (
          <CallCard key={c.identifier} call={c} topicId={topicId} onBuild={onBuildConsortium} />
        ))}
      </ul>

      <p className="muted calls-footnote">
        Source: EU Funding &amp; Tenders Portal, refreshed twice a day. Match is estimated from each topic’s title and
        description, so read the full call text before committing.
      </p>
    </div>
  );
}
