import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    title: "Find the right research partners before writing the grant",
    body: "Open Science Collaboration Network maps who researches what, who collaborates with whom, and where your consortium has gaps — using open data from OpenAlex and CORDIS.",
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
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);

  function finish() {
    localStorage.setItem("tour_done", "1");
    onClose();
  }

  // Capture the element that opened the tour (the "?" trigger), move focus into
  // the dialog, and restore focus on close (WCAG 2.4.3 / 2.1.2).
  useEffect(() => {
    triggerRef.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
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
    <div style={{
      position: "fixed", inset: 0, background: "var(--scrim)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: "var(--z-modal)", padding: "var(--sp-4)",
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)", width: "100%", maxWidth: 480,
          padding: "var(--sp-8)", position: "relative",
        }}
      >
        {/* Progress dots */}
        <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-6)", justifyContent: "center" }}>
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1} of ${STEPS.length}`}
              aria-current={i === step ? "step" : undefined}
              style={{
                width: i === step ? 20 : 8, height: 8, borderRadius: "var(--r-full)", padding: 0,
                border: "none", background: i === step ? "var(--accent)" : "var(--border)",
                transition: "width var(--dur-slow), background var(--dur-slow)", cursor: "pointer",
              }}
            />
          ))}
        </div>

        <div aria-hidden="true" style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--sp-4)", textAlign: "center" }}>{current.img}</div>
        <h2 id="tour-title" style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--w-bold)", marginBottom: "var(--sp-3)", lineHeight: "var(--leading-snug)", textAlign: "center" }}>
          {current.title}
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)", lineHeight: "var(--leading-relaxed)", marginBottom: "var(--sp-8)", textAlign: "center" }}>
          {current.body}
        </p>

        <div style={{ display: "flex", gap: "var(--sp-3)", justifyContent: "center" }}>
          {step > 0 && (
            <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>Back</button>
          )}
          {!isLast && (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Next</button>
          )}
          {isLast && (
            <button className="btn btn-primary" onClick={finish}>Get started</button>
          )}
        </div>

        <button
          onClick={finish}
          aria-label="Close tour"
          style={{
            position: "absolute", top: "var(--sp-4)", right: "var(--sp-4)",
            background: "none", border: "none", color: "var(--text-3)",
            cursor: "pointer", fontSize: "var(--text-base)", lineHeight: 1,
          }}
        >✕</button>
      </div>
    </div>
  );
}
