import { useCallback, useEffect, useState } from "react";
import { currentDeadline, daysUntil, formatDate } from "./components/callUtils";

// Partner pipeline: where each consortium member stands in the outreach funnel.
// Local-first. Stored under its own key so the consortium shape stays untouched:
//   pipeline_by_topic = { [topicId]: { [institutionId]: { status, checks, note, updatedAt } } }

const KEY = "pipeline_by_topic";

export const STATUSES = [
  { id: "shortlisted", label: "Shortlisted" },
  { id: "warmup",      label: "Warm-up" },
  { id: "contacted",   label: "Contacted" },
  { id: "replied",     label: "Replied" },
  { id: "in",          label: "In" },
  { id: "out",         label: "Out" },
];
export const DEFAULT_STATUS = "shortlisted";
const STATUS_IDS = new Set(STATUSES.map((s) => s.id));
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label ?? id;

// The four admin items a coordinator needs from every partner before the lock date.
export const CHECKS = [
  { id: "pic",  label: "PIC received" },
  { id: "lear", label: "LEAR named" },
  { id: "gep",  label: "Gender Equality Plan confirmed" },
  { id: "role", label: "Role agreed" },
];

export const NOTE_MAX = 1000;

export function emptyEntry() {
  return { status: DEFAULT_STATUS, checks: { pic: false, lear: false, gep: false, role: false }, note: "", updatedAt: null };
}

// Whatever is in storage may be stale, hand-edited or from an older build: coerce
// every field instead of trusting it.
function normalizeEntry(raw) {
  const base = emptyEntry();
  if (!raw || typeof raw !== "object") return base;
  const checks = raw.checks && typeof raw.checks === "object" ? raw.checks : {};
  return {
    status: STATUS_IDS.has(raw.status) ? raw.status : base.status,
    checks: Object.fromEntries(CHECKS.map((c) => [c.id, checks[c.id] === true])),
    note: typeof raw.note === "string" ? raw.note.slice(0, NOTE_MAX) : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

// In-memory copy. It is the source of truth whenever localStorage is unavailable
// (private mode, blocked storage, quota), and it survives the page unmounting when
// the user switches tabs, so a storage failure never silently drops their work.
let memory = null;

function readAll() {
  // Once this session has written anything, the in-memory copy is the newest. This is
  // what keeps data alive when setItem fails but getItem still "works" (returns null).
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  memory = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode — the in-memory copy above keeps the session working */
  }
}

/**
 * usePipeline(topicId) — the pipeline entries of one topic.
 *   get(id)          → the entry for an institution (defaults when it has none yet)
 *   set(id, patch)   → merge { status?, checks?, note? } into it; stamps updatedAt
 *   remove(id)       → forget the entry (the card falls back to "Shortlisted")
 *   entries          → { [institutionId]: entry } for this topic
 */
export function usePipeline(topicId) {
  const [all, setAll] = useState(readAll);

  useEffect(() => { writeAll(all); }, [all]);

  const entries = isObject(all[topicId]) ? all[topicId] : {};

  const get = useCallback(
    (id) => normalizeEntry(isObject(all[topicId]) ? all[topicId][id] : null),
    [all, topicId],
  );

  const set = useCallback((id, patch) => {
    if (topicId == null) return;
    setAll((prev) => {
      const topic = isObject(prev[topicId]) ? prev[topicId] : {};
      const cur = normalizeEntry(topic[id]);
      const next = normalizeEntry({
        ...cur,
        ...patch,
        checks: { ...cur.checks, ...(patch.checks || {}) },
        updatedAt: new Date().toISOString(),
      });
      return { ...prev, [topicId]: { ...topic, [id]: next } };
    });
  }, [topicId]);

  const remove = useCallback((id) => {
    if (topicId == null) return;
    setAll((prev) => {
      if (!isObject(prev[topicId]) || !(id in prev[topicId])) return prev;
      const { [id]: _gone, ...rest } = prev[topicId];
      return { ...prev, [topicId]: rest };
    });
  }, [topicId]);

  return { entries, get, set, remove };
}

// ── Partner-list lock ──────────────────────────────────────────────────────────
// A planning date, not an EU rule: the partner list should be settled this many
// days before the call deadline, which leaves time for the admin items (PIC, LEAR,
// Gender Equality Plan) and for the proposal itself.
export const LOCK_LEAD_DAYS = 60;
const AMBER_DAYS = 14; // "soon" = fewer days than this

const pad = (n) => String(n).padStart(2, "0");

/**
 * Lock date for a Horizon call (CallOut) = next_deadline − 60 days, or null when
 * there is no call or it publishes no deadline.
 * level: "calm" (14+ days), "soon" (under 14, amber), "late" (passed, red).
 * `text` always carries the meaning; colour only reinforces it.
 */
export function lockInfo(call) {
  const deadline = currentDeadline(call);
  if (!deadline) return null;
  const [y, m, d] = deadline.split("-").map(Number);
  if (!y || !m || !d) return null;
  const lock = new Date(y, m - 1, d - LOCK_LEAD_DAYS);
  const iso = `${lock.getFullYear()}-${pad(lock.getMonth() + 1)}-${pad(lock.getDate())}`;
  const days = daysUntil(iso);

  let text, level;
  if (days < 0) {
    text = `Partner list lock date passed ${days === -1 ? "1 day" : `${-days} days`} ago`;
    level = "late";
  } else if (days === 0) {
    text = "Partner list locks today";
    level = "soon";
  } else {
    text = `Partner list locks in ${days === 1 ? "1 day" : `${days} days`}`;
    level = days < AMBER_DAYS ? "soon" : "calm";
  }
  return { iso, days, level, text, dateLabel: formatDate(iso), deadlineLabel: formatDate(deadline) };
}
