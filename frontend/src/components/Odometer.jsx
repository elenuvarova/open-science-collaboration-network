import { useEffect, useRef, useState } from "react";

// Figures that roll into place once, when they first scroll into view.
// The prerendered HTML (and any browser without JS) shows the final value: the
// roll is armed only after hydration, and only if the figures are still off
// screen, so nobody sees them jump. The real value is screen-reader text; the
// rolling digit strips are hidden from assistive tech.
const DIGITS = "0123456789";

export default function Odometer({ value }) {
  const ref = useRef(null);
  const [phase, setPhase] = useState("static"); // static | armed | run

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return undefined; // already visible
    setPhase("armed");
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        requestAnimationFrame(() => setPhase("run"));
      }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Until the roll is armed, plain text: the same on the server and on hydration,
  // and no 0–9 strips in the indexed page.
  if (phase === "static") return <span ref={ref} className="odo">{value}</span>;

  const chars = [...String(value)];
  let d = 0;
  return (
    <span ref={ref} className="odo" data-phase={phase}>
      <span className="sr-only">{value}</span>
      <span className="odo-figures" aria-hidden="true">
        {chars.map((c, i) => {
          if (!DIGITS.includes(c)) return <span key={i} className="odo-char">{c}</span>;
          const n = phase === "armed" ? 0 : Number(c);
          return (
            <span key={i} className="odo-digit">
              <span className="odo-strip" style={{ "--n": n, "--k": d++ }}>
                {[...DIGITS].map((x) => <span key={x}>{x}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
