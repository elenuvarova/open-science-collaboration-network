import Icon from "./Icon";

// A copy button that confirms in place: the icon becomes a check that draws
// itself, the label crossfades to `done` without the button changing width (both
// labels share one grid cell), and after the caller resets `copied` it goes back.
// The accessible name stays `idle`; the confirmation is announced through a
// polite status (skip it with announce={false} when the caller has its own).
export default function CopyButton({ copied, onClick, idle, done, className = "btn btn-secondary btn-sm", buttonRef, disabled, announce = true, iconSize = 14 }) {
  return (
    <>
      <button ref={buttonRef} type="button" className={`${className} copy-btn`} data-copied={copied || undefined}
        onClick={onClick} disabled={disabled} aria-label={idle}>
        <Icon key={copied ? "done" : "idle"} name={copied ? "check" : "copy"} size={iconSize} draw={copied} />
        <span className="copy-btn-text" aria-hidden="true">
          <span>{idle}</span>
          <span>{done}</span>
        </span>
      </button>
      {announce && <span className="sr-only" role="status">{copied ? done : ""}</span>}
    </>
  );
}
