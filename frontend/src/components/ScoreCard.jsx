import { SCORE_MAX, SCORE_LABELS } from "./scoreMeta";

// focusKey / onFocusKey: the row under the pointer; the profile shows that
// component in the score ring and the other bars step back.
export default function ScoreCard({ score, breakdown = {}, focusKey = null, onFocusKey }) {
  const cls = score >= 70 ? "score-high" : score >= 50 ? "score-mid" : "score-low";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
        <span className={`score-pill ${cls}`} style={{ fontSize: "var(--text-base)", padding: "var(--sp-1) var(--sp-3)" }}>
          {score.toFixed(1)}
        </span>
        <span className="eyebrow">Partner Fit Score</span>
      </div>
      <div className={`breakdown${focusKey ? " has-focus" : ""}`} onMouseLeave={() => onFocusKey?.(null)}>
        {Object.entries(SCORE_LABELS).map(([key, label], i) => {
          const val = breakdown[key] ?? 0;
          const max = SCORE_MAX[key];
          const pct = Math.min((val / max) * 100, 100);
          return (
            <div className={`breakdown-row${focusKey === key ? " is-focus" : ""}`} key={key}
              onMouseEnter={() => onFocusKey?.(key)}>
              <span className="breakdown-label">{label}</span>
              <div className="breakdown-bar-bg">
                <div className="breakdown-bar grow-x" style={{ width: `${pct}%`, "--i": i }} />
              </div>
              <span className="breakdown-val">{val.toFixed(1)} / {max}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
