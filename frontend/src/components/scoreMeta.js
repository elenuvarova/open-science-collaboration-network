// Shared Partner Fit Score metadata — the per-dimension max points (weights) and
// human-readable labels. Single source of truth for ScoreCard, the Shortlist
// hover card, and the "How this score works" disclosure.
export const SCORE_MAX = {
  topic_relevance: 30,
  publication_activity: 20,
  eu_project_participation: 20,
  network_centrality: 15,
  country_diversity: 10,
  recent_activity: 5,
};

export const SCORE_LABELS = {
  topic_relevance: "Topic relevance",
  publication_activity: "Publication activity",
  eu_project_participation: "EU project participation",
  network_centrality: "Network centrality",
  country_diversity: "Country diversity",
  recent_activity: "Recent activity",
};

export const SCORE_DESCRIPTIONS = {
  topic_relevance: "How much the institution publishes on this exact topic, vs its peers.",
  publication_activity: "Overall volume of relevant publications.",
  eu_project_participation: "Participation in EU-funded projects on this topic.",
  network_centrality: "How connected the institution is in the co-authorship network.",
  country_diversity: "Whether the institution adds geographic spread to a consortium.",
  recent_activity: "Share of its relevant work published recently (2024+).",
};
