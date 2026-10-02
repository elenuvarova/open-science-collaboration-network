import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import "./modal.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog.
 *  - role="dialog" + aria-modal + aria-labelledby (the title)
 *  - focus moves into the dialog on open, Tab / Shift+Tab stay inside it, Esc closes
 *  - the rest of the app is made inert while it is open
 *  - focus returns to the element that opened it (if it is still on the page)
 *
 * `printable` marks the dialog as the only thing a print job should output (see the
 * @media print rules in modal.css).
 */
export default function Modal({ title, titleId, onClose, children, footer, wide = false, printable = false }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    document.body.classList.add("modal-open");
    if (printable) document.body.classList.add("print-modal");
    dialogRef.current?.focus();
    return () => {
      root?.removeAttribute("inert");
      document.body.classList.remove("modal-open", "print-modal");
      if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
    };
  }, [printable]);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeRef.current();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className={`modal${wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="modal-head modal-noprint">
          <h2 id={titleId} className="modal-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot modal-noprint">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
