import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import Icon from "./Icon";
import CopyButton from "./CopyButton";
import { buildDraft, useEvidence } from "../outreach";
import { statusLabel } from "../pipeline";
import "./outreach.css";

const BEFORE_CONTACT = new Set(["shortlisted", "warmup"]);

// navigator.clipboard needs a secure context and permission; fall back to the
// legacy select + execCommand path (works over http and in older browsers).
async function copyText(text, textarea) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      textarea.focus();
      textarea.select();
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

/**
 * Outreach kit dialog: an editable plain-text first message for one partner, built
 * from the partner's real evidence, with Copy and "Mark as contacted".
 */
export default function OutreachDialog({ inst, topicId, topicName, call, consortium, status, onCopied, onMarkContacted, onClose }) {
  const { data: evidence, loading, error, retry } = useEvidence(inst.id, topicId);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const textRef = useRef(null);
  const copyRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const fresh = () => buildDraft({ inst, topicName, call, evidence, consortium });

  // Fill the draft once the evidence has settled (loaded or failed). A draft the user
  // has already edited is never overwritten; "Reset draft" does that on request.
  useEffect(() => {
    if (loading || dirty) return;
    setDraft(fresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, evidence]);

  const gaps = (draft.match(/\[[^\]]+\]/g) || []).length;

  async function copy() {
    const ok = await copyText(draft, textRef.current);
    setNotice(ok ? "Copied to the clipboard." : "Couldn’t copy automatically. Select the text and copy it yourself.");
    if (ok) {
      onCopied();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    copyRef.current?.focus();
  }

  return (
    <Modal
      title={`Draft message: ${inst.name}`}
      titleId="outreach-title"
      onClose={onClose}
      wide
      footer={
        <>
          <CopyButton buttonRef={copyRef} className="btn btn-primary" copied={copied} onClick={copy} disabled={loading}
            idle="Copy" done="Copied" announce={false} />
          {BEFORE_CONTACT.has(status) ? (
            <button type="button" className="btn btn-secondary" onClick={onMarkContacted}>
              <Icon name="check" size={14} /> Mark as contacted
            </button>
          ) : (
            <span className="muted">Current status: {statusLabel(status)}.</span>
          )}
          <button type="button" className="btn btn-ghost modal-foot-end" onClick={onClose}>Close</button>
        </>
      }
    >
      <p className="muted outreach-hint">
        A starting point, not a finished email. Fill in the [bracketed] gaps and check the facts before you send it.
        It never names a person: add the contact’s name yourself.
      </p>

      <div role="status" aria-live="polite" className="outreach-status">
        {loading && <span className="muted">Loading this partner’s evidence…</span>}
      </div>

      {error && (
        <div role="alert" className="outreach-alert">
          <Icon name="alert" size={16} />
          <span>Couldn’t load this partner’s evidence, so the “why you” paragraph is a placeholder.</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>Retry</button>
        </div>
      )}

      <label htmlFor="outreach-text" className="outreach-label">Message (plain text, editable)</label>
      <textarea
        id="outreach-text"
        ref={textRef}
        className="outreach-text"
        rows={16}
        value={loading ? "" : draft}
        disabled={loading}
        aria-busy={loading}
        spellCheck
        onChange={(e) => { setDraft(e.target.value); setDirty(true); setNotice(""); }}
      />

      <div className="outreach-meta">
        <span className="muted">
          {loading ? "" : gaps === 0 ? "No [bracketed] gaps left." : `${gaps} [bracketed] ${gaps === 1 ? "gap" : "gaps"} left to fill in.`}
        </span>
        {dirty && !loading && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { setDraft(fresh()); setDirty(false); setNotice("Draft reset."); }}
          >
            Reset draft
          </button>
        )}
      </div>

      <p role="status" aria-live="polite" className="muted outreach-notice">{notice}</p>
    </Modal>
  );
}
