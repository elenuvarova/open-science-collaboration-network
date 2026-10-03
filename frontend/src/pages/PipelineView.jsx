import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import RollingNumber from "../components/RollingNumber";
import TypeBadge from "../components/TypeBadge";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import OutreachDialog from "../components/OutreachDialog";
import MeetingCard from "../components/MeetingCard";
import { countryName } from "../horizon";
import { CHECKS, NOTE_MAX, STATUSES, lockInfo, LOCK_LEAD_DAYS, statusLabel, usePipeline } from "../pipeline";
import { track } from "../analytics";
import "./pipeline.css";

// Same formula-injection guard as the Shortlist export (copied on purpose, not
// imported): a cell starting with = + - @ or a control char can run as a formula in
// Excel/Sheets, and notes are free text.
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

// updatedAt is a UTC timestamp; show the viewer's local calendar day.
const updatedLabel = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Cards are only draggable with a mouse-like pointer: on touch a draggable header
// would hijack long-press, and the Status menu is the way to move a card anyway.
const canDrag = () => typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

function checksSummary(checks) {
  const done = CHECKS.filter((c) => checks[c.id]);
  return `${done.length}/${CHECKS.length}${done.length ? `: ${done.map((c) => c.label).join("; ")}` : ""}`;
}

function LockChip({ call, lock, topicId }) {
  if (lock) {
    return (
      <div className="pipeline-lock">
        <p className={`lock-chip lock-${lock.level}`}>
          {lock.level !== "calm" && <Icon name="alert" size={14} />}
          <strong>{lock.text}</strong>
          <span>· {lock.dateLabel}</span>
        </p>
        <p className="muted">
          {LOCK_LEAD_DAYS} days before the {call.identifier} deadline ({lock.deadlineLabel}). A planning date, not an EU rule.
        </p>
      </div>
    );
  }
  if (call) {
    return (
      <div className="pipeline-lock">
        <p className="muted">{call.identifier} has no published deadline, so there is no lock date yet.</p>
      </div>
    );
  }
  return (
    <div className="pipeline-lock">
      <a className="pipeline-quiet-link" href={`#/calls/${topicId}`}>Pick a call on the Calls page to set a lock date</a>
    </div>
  );
}

function PartnerCard({ inst, entry, draggable, dragging, onChange, onDraft, onCard, onDragStart, onDragEnd }) {
  const { status, checks, note, updatedAt } = entry;
  const done = CHECKS.filter((c) => checks[c.id]).length;
  const id = inst.id;

  return (
    <li>
      {/* The name lets a status change morph the card from its old column to the new one. */}
      <article className={`card pipeline-card${dragging ? " is-dragging" : ""}`} data-card-id={id} aria-labelledby={`pc-name-${id}`}
        style={{ viewTransitionName: `pipeline-card-${id}` }}>
        {/* Dragging is an extra for mouse users; the Status menu below is the way to move a card. */}
        <header className="pipeline-card-head" draggable={draggable} onDragStart={(e) => onDragStart(e, id)} onDragEnd={onDragEnd}>
          <h4 id={`pc-name-${id}`} className="pipeline-card-name">{inst.name}</h4>
          <div className="pipeline-card-meta">
            <TypeBadge type={inst.type} />
            {inst.country && <span>{countryName(inst.country)}</span>}
          </div>
        </header>

        <div className="pipeline-field">
          <label htmlFor={`pc-status-${id}`} className="eyebrow">Status<span className="sr-only"> of {inst.name}</span></label>
          <select
            id={`pc-status-${id}`}
            className="filter-select pipeline-status"
            value={status}
            onChange={(e) => onChange(inst, { status: e.target.value }, "select")}
          >
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        <fieldset className="pipeline-checks">
          <legend className="eyebrow">
            Admin checklist <span className="pipeline-check-count">{done}/{CHECKS.length}</span>
            <span className="sr-only"> for {inst.name}</span>
          </legend>
          {CHECKS.map((c) => (
            <label key={c.id} className={`pipeline-check${checks[c.id] ? " is-done" : ""}`}>
              <span className="check-box">
                <input
                  type="checkbox"
                  checked={checks[c.id]}
                  onChange={(e) => onChange(inst, { checks: { [c.id]: e.target.checked } })}
                />
                {checks[c.id] && <Icon name="check" size={12} strokeWidth={2.6} draw className="check-box-tick" />}
              </span>
              <span className="pipeline-check-label">{c.label}</span>
            </label>
          ))}
        </fieldset>

        <div className="pipeline-field">
          <label htmlFor={`pc-note-${id}`} className="eyebrow">Note<span className="sr-only"> on {inst.name}</span></label>
          <textarea
            id={`pc-note-${id}`}
            className="pipeline-note"
            rows={2}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => onChange(inst, { note: e.target.value })}
          />
        </div>

        <div className="pipeline-card-actions">
          <button type="button" className="btn btn-secondary" data-draft-btn aria-label={`Draft message for ${inst.name}`} onClick={() => onDraft(inst)}>
            Draft message
          </button>
          <button type="button" className="btn btn-ghost btn-sm" aria-label={`Meeting card for ${inst.name}`} onClick={() => onCard(inst)}>
            Meeting card
          </button>
        </div>

        {updatedAt && <p className="muted pipeline-updated">Updated {updatedLabel(updatedAt)}</p>}
      </article>
    </li>
  );
}

export default function PipelineView({ topicId, topicName, consortium = [], activeCall = null }) {
  const pipeline = usePipeline(topicId);
  const [dialog, setDialog] = useState(null); // { kind: "draft" | "card", inst }
  const [announcement, setAnnouncement] = useState("");
  const [dragId, setDragId] = useState(null);
  const [overStatus, setOverStatus] = useState(null);
  const focusAfter = useRef(null);
  const dragEnabled = canDrag();

  // A card that changes status lands in another column, which remounts it and drops
  // keyboard focus. Put focus back on the same control in its new place.
  useEffect(() => {
    const f = focusAfter.current;
    if (!f) return;
    focusAfter.current = null;
    document.querySelector(`[data-card-id="${f.id}"] ${f.selector}`)?.focus();
  });

  // Close any open dialog when the topic changes (its partner no longer applies).
  useEffect(() => { setDialog(null); }, [topicId]);

  const lock = lockInfo(activeCall);
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s.id, []]));
  for (const inst of consortium) byStatus[pipeline.get(inst.id).status].push(inst);

  function moveTo(inst, status, focusSelector) {
    if (pipeline.get(inst.id).status === status) return;
    // The card travels to its new column (View Transitions; an instant move where
    // unsupported or when the user asks for less motion).
    // Focus target and announcement go in the same update as the move, so focus is
    // restored after the card has landed in its new column, not before.
    const update = () => {
      if (focusSelector) focusAfter.current = { id: inst.id, selector: focusSelector };
      pipeline.set(inst.id, { status });
      setAnnouncement(`${inst.name} moved to ${statusLabel(status)}.`);
    };
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !calm) document.startViewTransition(() => flushSync(update));
    else update();
    track("pipeline_status_changed", { topic: topicId, status });
  }

  // Cards report every change here; status changes are tracked, notes never are.
  function onChange(inst, patch, from) {
    if (patch.status) moveTo(inst, patch.status, from === "select" ? "select" : null);
    else pipeline.set(inst.id, patch);
  }

  function markContacted(inst) {
    moveTo(inst, "contacted", "[data-draft-btn]");
    setDialog(null);
  }

  function exportCsv() {
    const order = (s) => STATUSES.findIndex((x) => x.id === s);
    const rows = consortium
      .map((inst) => ({ inst, e: pipeline.get(inst.id) }))
      .sort((a, b) => order(a.e.status) - order(b.e.status))
      .map(({ inst, e }) => [inst.name, inst.country || "", inst.type || "", statusLabel(e.status), checksSummary(e.checks), e.note]);
    downloadCsv("pipeline.csv", ["Name", "Country", "Type", "Status", "Checks", "Note"], rows);
  }

  function onDragStart(e, id) {
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  }
  function endDrag() { setDragId(null); setOverStatus(null); }
  function onDrop(e, status) {
    e.preventDefault();
    const inst = consortium.find((i) => i.id === dragId);
    endDrag();
    if (inst) moveTo(inst, status, null);
  }

  if (consortium.length === 0) {
    return (
      <EmptyState
        icon="plus"
        role="status"
        title="No partners to track yet"
        body="Add institutions to your consortium with the + button on the Partner Shortlist. They will show up here, ready for outreach."
        action={<a className="btn btn-primary btn-sm" href={`#/shortlist/${topicId}`}>Go to the Partner Shortlist</a>}
      />
    );
  }

  return (
    <div className="pipeline">
      <p className="body-text pipeline-intro">
        Track who you have contacted and what is still missing for each partner. Change a card’s status with its Status menu
        (on a large screen you can also drag it to another column). PIC is the Participant Identification Code; LEAR is the
        Legal Entity Appointed Representative.
      </p>

      <section className="card pipeline-strip" aria-label="Pipeline summary">
        <ul className="pipeline-counts" aria-label="Partners per status">
          {STATUSES.map((s) => (
            <li key={s.id} className="pipeline-count">
              <span>{s.label}</span>
              <strong><RollingNumber value={byStatus[s.id].length} /></strong>
            </li>
          ))}
        </ul>
        <LockChip call={activeCall} lock={lock} topicId={topicId} />
        <button type="button" className="btn btn-secondary btn-sm pipeline-export" onClick={exportCsv}>
          <Icon name="download" size={14} /> Export CSV
        </button>
      </section>

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>

      <div className="pipeline-board">
        {STATUSES.map((s) => {
          const list = byStatus[s.id];
          return (
            <section
              key={s.id}
              className={`pipeline-col${list.length === 0 ? " is-empty" : ""}${overStatus === s.id ? " is-over" : ""}`}
              aria-labelledby={`pcol-${s.id}`}
              onDragOver={(e) => { if (dragId != null) { e.preventDefault(); setOverStatus(s.id); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverStatus(null); }}
              onDrop={(e) => onDrop(e, s.id)}
            >
              <h3 id={`pcol-${s.id}`} className="pipeline-col-title">
                {s.label} <span className="pipeline-col-count"><RollingNumber value={list.length} /></span>
              </h3>
              {list.length === 0 && <p className="muted pipeline-col-empty">No partners here</p>}
              <ul className="pipeline-cards">
                {list.map((inst) => (
                  <PartnerCard
                    key={inst.id}
                    inst={inst}
                    entry={pipeline.get(inst.id)}
                    draggable={dragEnabled}
                    dragging={dragId === inst.id}
                    onChange={onChange}
                    onDraft={(i) => setDialog({ kind: "draft", inst: i })}
                    onCard={(i) => setDialog({ kind: "card", inst: i })}
                    onDragStart={onDragStart}
                    onDragEnd={endDrag}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {dialog?.kind === "draft" && (
        <OutreachDialog
          inst={dialog.inst}
          topicId={topicId}
          topicName={topicName}
          call={activeCall}
          consortium={consortium}
          status={pipeline.get(dialog.inst.id).status}
          onCopied={() => track("outreach_copied", { topic: topicId })}
          onMarkContacted={() => markContacted(dialog.inst)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "card" && (
        <MeetingCard
          inst={dialog.inst}
          topicId={topicId}
          topicName={topicName}
          call={activeCall}
          onPrinted={() => track("meeting_card_printed", { topic: topicId })}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
