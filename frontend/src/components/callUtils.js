// Shared helpers for Horizon call cards and the deadline banner.

// "2026-10-08" → local Date (parsing the bare string would shift it by the UTC offset).
function parseDay(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(iso) {
  if (!iso) return "";
  return parseDay(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Whole days from today (local) to the deadline. Recomputed on the client so the
// number stays right even when the page has been open for a while.
export function daysUntil(iso) {
  if (!iso) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDay(iso) - today) / 86400000);
}

// The deadline that still matters: the first cut-off on or after today. A saved
// call keeps the next_deadline it had when it was picked; once that cut-off passes
// a multi-stage call can still be open, so always derive it from `deadlines`.
// Returns null when every deadline has passed.
export function currentDeadline(call) {
  if (!call) return null;
  const all = [...(call.deadlines || []), call.next_deadline].filter(Boolean).map((d) => String(d).slice(0, 10));
  const upcoming = [...new Set(all)].sort().filter((d) => daysUntil(d) >= 0);
  return upcoming[0] || null;
}

export function daysLabel(days) {
  if (days == null) return "";
  if (days < 0) return "Closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

// "urgent" ≤ 14 days, "soon" ≤ 45 days. Always paired with the text label, so
// colour is never the only signal.
export function urgency(days) {
  if (days == null) return "calm";
  if (days <= 14) return "urgent";
  if (days <= 45) return "soon";
  return "calm";
}

export function formatEuro(n) {
  if (n == null) return null;
  if (n >= 1e6) return `€${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `€${Math.round(n / 1e3)}K`;
  return `€${n}`;
}

export const ACTION_LABELS = {
  RIA: "Research and Innovation Action",
  IA: "Innovation Action",
  CSA: "Coordination and Support Action",
  COFUND: "Programme Cofund Action",
  PCP: "Pre-commercial Procurement",
  PPI: "Public Procurement of Innovative Solutions",
  MSCA: "Marie Skłodowska-Curie Action",
  ERC: "European Research Council grant",
  EIC: "European Innovation Council action",
  Prize: "Prize",
};
