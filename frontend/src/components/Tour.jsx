import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { track } from "../analytics";
import Icon from "./Icon";

const STEPS = [
  {
    title: "Find the right research partners before writing the grant",
    body: "noda maps who researches what, who collaborates with whom, and where your consortium has gaps — using open data from OpenAlex and CORDIS.",
    img: "🔬",
  },
  {
    title: "Find & shortlist partners",
    body: "The Partner Shortlist ranks institutions by Partner Fit Score — a weighted blend of topic relevance, publication activity, EU project history, and network centrality. Click any row to open its full breakdown.",
    img: "📋",
  },
  {
    title: "Build your consortium → check gaps",
    body: "The + button on a row adds that organisation to your consortium. Then open the Consortium Gaps tab: it shows which roles your picks cover — research lead, technical, policy, NGO — and which are still missing before you write the proposal.",
    img: "🧩",
  },
  {
    title: "6 topics, live data",
    body: "The dataset covers 6 research topics, refreshed weekly from OpenAlex and CORDIS. Switch between them with the Topic selector in the header.",
    img: "🌍",
  },
];

export default function Tour({ onClose }) {
  const [step, setStep] = useState(0);
  // Which way the content slides: forward from the right, back from the left.
  const [dir, setDir] = useState(1);
  const go = (next) => { setDir(next > step ? 1 : -1); setStep(next); };
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);

  function finish() {
    localStorage.setItem("tour_done", "1");
    track("tour_completed");
    onClose();
  }

  // Capture the element that opened the tour (the "?" trigger), move focus into
  // the dialog, and restore focus on close (WCAG 2.4.3 / 2.1.2).
  useEffect(() => {
    triggerRef.current = document.activeElement;
    dialogRef.current?.focus();
    // Belt and braces for aria-modal: if anything moves focus outside the dialog,
    // bring it back, so keyboard users can never tab into the page underneath.
    const keepFocus = (e) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target)) dialogRef.current.focus();
    };
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("focusin", keepFocus);
      if (triggerRef.current && typeof triggerRef.current.focus === "function") {
        triggerRef.current.focus();
      }
    };
  }, []);

  function onKeyDown(e) {
    if (e.key === "Escape") {
      finish();
      return;
    }
    if (e.key !== "Tab") return;
    // Focus trap: keep Tab / Shift+Tab cycling within the dialog.
    const focusable = dialogRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      style={{
        position: "fixed", inset: 0, background: "var(--scrim)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: "var(--z-modal)", padding: "var(--sp-4)",
      }}>
      <m.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)", width: "100%", maxWidth: 480,
          padding: "var(--sp-8)", position: "relative", overflow: "hidden",
        }}
      >
        {/* Progress: a counter, as well-made product tours do, plus a thin bar. */}
        <div className="tour-progress">
          <p className="tour-step" aria-live="polite">
            Step {step + 1} of {STEPS.length}<span className="sr-only">: {current.title}</span>
          </p>
          <div className="tour-track" aria-hidden="true">
            <div className="tour-fill" style={{ transform: `scaleX(${(step + 1) / STEPS.length})` }} />
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <m.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -16, transition: { duration: 0.12 } }}
          >
            <div aria-hidden="true" style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--sp-4)", textAlign: "center" }}>{current.img}</div>
            <h2 id="tour-title" style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--w-bold)", marginBottom: "var(--sp-3)", lineHeight: "var(--leading-snug)", textAlign: "center" }}>
              {current.title}
            </h2>
            <p className="body-text" style={{ color: "var(--text-3)", marginBottom: "var(--sp-8)", textAlign: "center" }}>
              {current.body}
            </p>
          </m.div>
        </AnimatePresence>

        <div style={{ display: "flex", gap: "var(--sp-3)", justifyContent: "center" }}>
          {step > 0 && (
            <button className="btn btn-secondary" onClick={() => go(step - 1)}>Back</button>
          )}
          {!isLast && (
            <button className="btn btn-primary" onClick={() => go(step + 1)}>Next</button>
          )}
          {isLast && (
            <button className="btn btn-primary" onClick={finish}>Get started</button>
          )}
        </div>

        <button
          className="icon-btn"
          onClick={finish}
          aria-label="Close tour"
          style={{ position: "absolute", top: "var(--sp-4)", right: "var(--sp-4)" }}
        ><Icon name="close" size={14} /></button>
      </m.div>
    </m.div>
  );
}
