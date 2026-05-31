const LABELS = {
  topic_relevance: "Topic relevance",
  publication_activity: "Publication activity",
  eu_project_participation: "EU project participation",
  network_centrality: "Network centrality",
  country_diversity: "Country / consortium diversity",
  recent_activity: "Recent activity",
};

export default function ScoreCard({ score, breakdown = {} }) {
  const cls = score >= 70 ? "score-high" : score >= 50 ? "score-mid" : "score-low";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
        <span className={`score-pill ${cls}`}>{score.toFixed(1)}</span>
        <span className="muted">Partner Fit Score</span>
      </div>
      <div className="breakdown">
        {Object.entries(LABELS).map(([key, label]) => {
          const val = breakdown[key] ?? 0;
          const pct = Math.min((val / 30) * 100, 100);
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
