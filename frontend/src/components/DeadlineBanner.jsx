import Icon from "./Icon";
import { currentDeadline, daysLabel, daysUntil, formatDate, urgency } from "./callUtils";
import "./calls.css";

/**
 * Deadline banner for a Horizon call the user is building a consortium for.
 * Rendered by App above the shortlist and the gap view once a call is picked.
 *
 * `call` is a CallOut from GET /api/calls (identifier, title, next_deadline, url).
 * Days left are recomputed from the date, so a stale `days_left` never shows.
 */
export default function DeadlineBanner({ call, onDismiss, onOpenPortal }) {
  if (!call) return null;
  const deadline = currentDeadline(call);
  const days = daysUntil(deadline);
  const level = urgency(days);
  const cls = level === "urgent" ? " is-urgent" : level === "soon" ? " is-soon" : "";

  return (
    <section className={`deadline-banner${cls}`} aria-label={`Target call ${call.identifier}`}>
      {level !== "calm" && <Icon name="alert" size={18} />}
      <div className="deadline-banner-main">
        <span className="deadline-banner-title">Building a consortium for {call.identifier}</span>
        <span className="deadline-banner-meta">
          {deadline
            ? <>Deadline {formatDate(deadline)}{days != null && <> · <strong>{daysLabel(days)}</strong></>}</>
            : <strong>All deadlines for this call have passed — pick another call.</strong>}
        </span>
      </div>
      {call.url && (
        <a
          href={call.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpenPortal}
          aria-label={`Open ${call.identifier} on the EU Funding & Tenders Portal (opens in a new tab)`}
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-1)" }}
        >
          Call details <Icon name="external" size={14} />
        </a>
      )}
      {onDismiss && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          Clear call
        </button>
      )}
    </section>
  );
}
