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
