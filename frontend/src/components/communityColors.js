// Single source of truth for the graph community (cluster) palette — noda A1.
// Shared by GraphCanvas (node fill) and GraphLegend (swatches). Every node also
// gets a 1.5px ink outline, so the light fills (lime, sage, sky) still clear 3:1.
export const COMMUNITY_COLORS = [
  "#1b7fe8", "#1e4a22", "#d08cfa", "#ddf80a", "#afd3b2",
  "#a6cdf2", "#3c6383", "#cbcad7", "#12121e", "#5e5e6c",
];

export const nodeColor = (communityId) =>
  COMMUNITY_COLORS[(communityId ?? 0) % COMMUNITY_COLORS.length];
