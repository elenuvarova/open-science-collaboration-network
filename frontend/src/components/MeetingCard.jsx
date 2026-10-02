import Modal from "./Modal";
import Icon from "./Icon";
import TypeBadge from "./TypeBadge";
import { countryName } from "../horizon";
import { evidenceLines, profileUrl, useEvidence } from "../outreach";
import "./outreach.css";

/**
 * Meeting card: an A6-ish one-pager for a partner (name, type, score, up to three
 * evidence lines, noda link). Printing outputs the card alone (print rules in
 * modal.css and outreach.css); the @page rule below is only mounted while the card
 * is open, so ordinary printing of the app is unaffected.
 */
export default function MeetingCard({ inst, topicId, topicName, call, onPrinted, onClose }) {
  const { data: evidence, loading, error, retry } = useEvidence(inst.id, topicId);
  const lines = evidenceLines(evidence);
  const score = Number.isFinite(inst.partner_fit_score) ? Math.round(inst.partner_fit_score) : null;

  function print() {
    onPrinted();
    window.print();
  }

  return (
    <Modal
      title={`Meeting card: ${inst.name}`}
      titleId="meeting-card-title"
      onClose={onClose}
      printable
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={print} disabled={loading}>
            <Icon name="download" size={14} /> Print card
          </button>
          <button type="button" className="btn btn-ghost modal-foot-end" onClick={onClose}>Close</button>
        </>
      }
    >
      <style media="print">{"@page { size: A6 portrait; margin: 8mm; }"}</style>

      <article className="meeting-card" aria-label={`Meeting card for ${inst.name}`}>
        <p className="eyebrow">noda · partner meeting card</p>
        <h3 className="meeting-card-name">{inst.name}</h3>
        <div className="meeting-card-meta">
          <TypeBadge type={inst.type} />
          {inst.country && <span>{countryName(inst.country)}</span>}
        </div>

        {score != null && (
          <p className="meeting-card-score">
            <span className="meeting-card-num">{score}</span>
            <span className="muted"> / 100 partner fit{topicName ? ` for “${topicName}”` : ""}</span>
          </p>
        )}

        <h4 className="eyebrow meeting-card-h">Evidence</h4>
        {loading && <p className="muted" role="status">Loading evidence…</p>}
        {error && (
          <p role="alert" className="muted">
            Couldn’t load the evidence.{" "}
            <button type="button" className="btn btn-ghost btn-sm modal-noprint" onClick={retry}>Retry</button>
          </p>
        )}
        {!loading && !error && lines.length === 0 && <p className="muted">No CORDIS project or co-partner record for this topic.</p>}
        {lines.length > 0 && (
          <ul className="meeting-card-lines">
            {lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}

        {call && <p className="meeting-card-call muted">Call: {call.identifier}</p>}
        <p className="meeting-card-link">{profileUrl(topicId, inst.id)}</p>
      </article>
    </Modal>
  );
}
