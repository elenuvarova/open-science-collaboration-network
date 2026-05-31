const LABELS = {
  topic_relevance:          "Topic relevance",
  publication_activity:     "Publication activity",
  eu_project_participation: "EU project participation",
  network_centrality:       "Network centrality",
  country_diversity:        "Country diversity",
  recent_activity:          "Recent activity",
};

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
        {Object.entries(LABELS).map(([key, label]) => {
          const val = breakdown[key] ?? 0;
          const max = key === "topic_relevance" ? 30 : key === "publication_activity" ? 20 : key === "eu_project_participation" ? 20 : key === "network_centrality" ? 15 : key === "country_diversity" ? 10 : 5;
          const pct = Math.min((val / max) * 100, 100);
          return (
            <div className="breakdown-row" key={key}>
              <span className="breakdown-label">{label}</span>
              <div className="breakdown-bar-bg">
                <div className="breakdown-bar" style={{ width: `${pct}%` }} />
              </div>
              <span className="breakdown-val">{val.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
