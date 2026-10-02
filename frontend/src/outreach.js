import { useEffect, useState } from "react";
import { getEvidence } from "./api";
import { formatDate } from "./components/callUtils";

// Outreach kit: a plain-text first message and a printable meeting card for one
// partner. Everything factual in them comes from GET /api/institutions/{id}/evidence;
// when a fact is not there the text says less or leaves a [bracketed] gap for the
// user to fill. Nothing here ever names a person.

// Proposed role by institution type. Aliases match components/TypeBadge.jsx.
const TYPE_ALIAS = { university: "education", ngo: "nonprofit", public_body: "government", archive: "facility" };
const ROLE_BY_TYPE = {
  education:  "research partner",
  company:    "industry / exploitation partner",
  government: "public authority / policy partner",
  nonprofit:  "civil-society / dissemination partner",
  facility:   "infrastructure / pilot partner",
  healthcare: "clinical / health-sector partner",
};
const ROLE_PLACEHOLDER = "[proposed role]";

export function proposedRole(type) {
  const key = String(type || "").toLowerCase().replace(/ /g, "_");
  return ROLE_BY_TYPE[TYPE_ALIAS[key] || key] || ROLE_PLACEHOLDER;
}

const withArticle = (phrase) => `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`;

function truncate(text, max) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[\s,;:.–-]+$/, "") + "…";
}

function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Co-partners of this institution that are also in the user's consortium.
function sharedPartners(evidence, selfId, consortium) {
  const mine = new Map((consortium || []).map((i) => [i.id, i.name]));
  return (evidence?.co_partners || [])
    .filter((c) => c.id !== selfId && mine.has(c.id))
    .slice(0, 3)
    .map((c) => mine.get(c.id));
}

// The "why you" paragraph. Built only from what the evidence endpoint returned.
function whyYou({ evidence, topicName, selfId, consortium }) {
  const projects = evidence?.totals?.projects ?? 0;
  const coordinated = evidence?.totals?.coordinator ?? 0;
  const latest = evidence?.projects?.[0]?.title;
  const shared = sharedPartners(evidence, selfId, consortium);

  const together = shared.length
    ? `you already collaborate with ${joinList(shared)}, who ${shared.length === 1 ? "is" : "are"} also in the consortium I am putting together`
    : "";

  if (projects > 0) {
    let s = `You have taken part in ${plural(projects, "EU project", "EU projects")} related to ${topicName ? `“${topicName}”` : "this topic"}`;
    if (coordinated > 0) s += ` (coordinating ${coordinated})`;
    if (latest) s += `, including “${truncate(latest, 110)}”`;
    return s + (together ? `, and ${together}.` : ".");
  }
  if (together) return `${together[0].toUpperCase()}${together.slice(1)}.`;
  return "[Why you: one sentence on their relevant expertise.]";
}

/**
 * Plain-text draft for one partner.
 *   inst        { id, name, type }
 *   call        activeCall (CallOut) or null
 *   evidence    EvidenceOut or null (still loading / failed)
 *   consortium  the topic's consortium, to name shared collaborators
 */
export function buildDraft({ inst, topicName, call, evidence, consortium }) {
  const subject = call
    ? `Invitation to join a Horizon Europe consortium (${call.identifier})`
    : "Invitation to join a Horizon Europe consortium";

  const intro = call
    ? `I am preparing a proposal for the Horizon Europe call ${call.identifier}${call.title ? ` (“${truncate(call.title, 140)}”)` : ""}.`
    : `I am preparing a Horizon Europe proposal${topicName ? ` on ${topicName}` : ""}.`;
  const concept = "[Sentence 1: what the project will do and why it matters.] [Sentence 2: what the consortium will deliver and who benefits.]";

  const timeline = call?.next_deadline
    ? `The call closes on ${formatDate(call.next_deadline)}. [Proposed next step, for example a 30-minute call, and by when I need your answer.]`
    : "[Timeline: the call deadline, and by when I need your answer.]";

  return [
    `Subject: ${subject}`,
    "",
    "Dear [contact name],",
    "",
    `${intro} ${concept}`,
    "",
    `We would like to invite ${inst.name} to join as ${withArticle(proposedRole(inst.type))}.`,
    "",
    whyYou({ evidence, topicName, selfId: inst.id, consortium }),
    "",
    timeline,
    "",
    "Kind regards,",
    "[your name, role, organisation]",
  ].join("\n");
}

function years(p) {
  if (p.start_year && p.end_year && p.start_year !== p.end_year) return `${p.start_year}–${p.end_year}`;
  return p.start_year || p.end_year || null;
}

// Up to three evidence lines for the meeting card. A line only appears when the
// data behind it exists.
export function evidenceLines(evidence) {
  if (!evidence) return [];
  const lines = [];
  const { totals, projects = [], co_partners: partners = [] } = evidence;
  if (totals?.projects > 0) {
    lines.push(`${plural(totals.projects, "EU project", "EU projects")} on this topic, ${totals.coordinator} as coordinator.`);
  }
  if (projects[0]) {
    const p = projects[0];
    const meta = [p.programme, years(p)].filter(Boolean).join(", ");
    lines.push(`Latest project: ${truncate(p.title, 100)}${meta ? ` (${meta})` : ""}.`);
  }
  if (partners.length) {
    lines.push(`Works most with: ${joinList(partners.slice(0, 3).map((c) => c.name))}.`);
  }
  return lines.slice(0, 3);
}

// The profile link printed on the meeting card (paper can't click a button).
export function profileUrl(topicId, institutionId) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/shortlist/${topicId}/${institutionId}`;
}

/** Evidence for one institution on one topic: { data, loading, error, retry }. */
export function useEvidence(id, topicId) {
  const [state, setState] = useState({ data: null, loading: true, error: false });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: false });
    getEvidence(id, topicId)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: false }); })
      .catch(() => { if (!cancelled) setState({ data: null, loading: false, error: true }); });
    return () => { cancelled = true; };
  }, [id, topicId, reloadKey]);

  return { ...state, retry: () => setReloadKey((k) => k + 1) };
}
