const BASE = "/api";

async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const getTopics = () => get("/topics");
export const getInstitutions = (params = {}) => get("/institutions?" + new URLSearchParams(params));
export const getInstitution = (id, topic) => get(`/institutions/${id}` + (topic ? `?topic=${topic}` : ""));
export const getGraph = (params = {}) => get("/graph?" + new URLSearchParams(params));
export const getBrief = (topicId) => get(`/brief?topic=${topicId}`);
export const searchWorks = (q, topicId, limit = 10) =>
  get(`/search?q=${encodeURIComponent(q)}&topic=${topicId}&limit=${limit}`);
export const getMeta = () => get("/meta");
export const getBenchmark = (topicId) => get(`/benchmark?topic=${topicId}`);
export const getEvidence = (id, topic) =>
  get(`/institutions/${id}/evidence` + (topic ? `?topic=${topic}` : ""));
export const getSuggestions = (topic, ids, role) => {
  const p = new URLSearchParams({ topic, ids: ids.join(",") });
  if (role) p.set("role", role);
  return get("/suggest?" + p);
};
// Who in a consortium already works together (max 20 ids):
// { topic_id, members, pairs: [{a, b, coauthor, project, weight}], isolated, weak, bridges }.
export const getTies = (topic, ids) =>
  get("/consortium/ties?" + new URLSearchParams({ topic, ids: ids.join(",") }));
// Open + forthcoming Horizon Europe call topics matched to a noda topic,
// nearest deadline first. { topic_id, calls: CallOut[], fetched_at, stale }.
export const getCalls = (topicId) => get(`/calls?topic=${topicId}`);
