import { SCORE_MAX, SCORE_LABELS } from "./scoreMeta";

export default function ScoreCard({ score, breakdown = {} }) {
  const cls = score >= 70 ? "score-high" : score >= 50 ? "score-mid" : "score-low";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
        <span className={`score-pill ${cls}`} style={{ fontSize: "var(--text-base)", padding: "var(--sp-1) var(--sp-3)" }}>
          {score.toFixed(1)}
        </span>
        <span className="eyebrow">Partner Fit Score</span>
      </div>
      <div className="breakdown">
        {Object.entries(SCORE_LABELS).map(([key, label]) => {
          const val = breakdown[key] ?? 0;
          const max = SCORE_MAX[key];
          const pct = Math.min((val / max) * 100, 100);
          return (
            <div className="breakdown-row" key={key}>
              <span className="breakdown-label">{label}</span>
              <div className="breakdown-bar-bg">
                <div className="breakdown-bar" style={{ width: `${pct}%` }} />
              </div>
              <span className="breakdown-val">{val.toFixed(1)} / {max}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
