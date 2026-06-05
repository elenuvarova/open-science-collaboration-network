// Single source of truth for the graph community (cluster) palette.
// Shared by GraphCanvas (node fill) and GraphLegend (swatches).
export const COMMUNITY_COLORS = [
  "#4f8ef7", "#4ade80", "#fbbf24", "#f87171", "#a78bfa",
  "#34d399", "#fb923c", "#e879f9", "#38bdf8", "#facc15",
];

export const nodeColor = (communityId) =>
  COMMUNITY_COLORS[(communityId ?? 0) % COMMUNITY_COLORS.length];
