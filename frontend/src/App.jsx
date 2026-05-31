import { useEffect, useState } from "react";
import { getTopics } from "./api";
import NetworkMap from "./pages/NetworkMap";
import Shortlist from "./pages/Shortlist";
import GapView from "./pages/GapView";

const PAGES = [
  { id: "shortlist", label: "Partner Shortlist" },
  { id: "network",   label: "Network Map" },
  { id: "gaps",      label: "Consortium Gaps" },
];

export default function App() {
  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState(null);
  const [page, setPage] = useState("shortlist");

  useEffect(() => {
    getTopics().then((t) => {
      setTopics(t);
      if (t.length) setTopicId(t[0].id);
    });
  }, []);

  const topic = topics.find((t) => t.id === topicId);

  return (
    <div className="layout">
      <header className="topbar">
        <span className="topbar-title">Open Science Collaboration Network</span>
        {topics.length > 1 && (
          <select
            value={topicId ?? ""}
            onChange={(e) => setTopicId(Number(e.target.value))}
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "0.3rem 0.6rem", fontSize: "0.82rem" }}
          >
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {topic && <span className="muted" style={{ fontSize: "0.8rem" }}>{topic.name}</span>}
        <nav>
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={`nav-btn ${page === p.id ? "active" : ""}`}
              onClick={() => setPage(p.id)}
            >
              {p.label}
            </button>
          ))}
        </nav>
      </header>

      <main className={page === "network" ? "page" : "page"} style={page === "network" ? { padding: "0.75rem", maxWidth: "100%" } : {}}>
        {!topicId && <div className="spinner">Loading…</div>}
        {topicId && page === "shortlist" && <Shortlist topicId={topicId} />}
        {topicId && page === "network"   && <NetworkMap topicId={topicId} />}
        {topicId && page === "gaps"      && <GapView topicId={topicId} />}
      </main>
    </div>
  );
}
