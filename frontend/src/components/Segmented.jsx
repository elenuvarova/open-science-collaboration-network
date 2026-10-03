import { useRef } from "react";
import useSlidingIndicator from "../hooks/useSlidingIndicator";

// A two-or-three-way toggle (Grid/List, Full network/My consortium). The white
// pill slides to the picked option. Buttons with aria-pressed, so each stays a
// plain Tab stop; ←/→ also move between them.
export default function Segmented({ label, options, value, onChange, className = "" }) {
  const ref = useRef(null);
  useSlidingIndicator(ref, value);

  function onKeyDown(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const buttons = [...ref.current.querySelectorAll("button")];
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    buttons[(i + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length].focus();
  }

  return (
    <div ref={ref} className={`segmented has-indicator ${className}`} role="group" aria-label={label} onKeyDown={onKeyDown}>
      <span className="indicator" aria-hidden="true" />
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          className="segmented-btn"
          aria-pressed={value === v}
          data-active={value === v}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
