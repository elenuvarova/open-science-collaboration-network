import { useEffect, useState } from "react";
import { getTopics } from "./api";
import NetworkMap from "./pages/NetworkMap";
import Shortlist from "./pages/Shortlist";
import GapView from "./pages/GapView";
import Tour from "./components/Tour";
import ThemeToggle from "./components/ThemeToggle";

const PAGES = [
  { id: "shortlist", label: "Partner Shortlist" },
  { id: "network",   label: "Network Map" },
  { id: "gaps",      label: "Consortium Gaps" },
];

function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark"
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);
  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");
  return [theme, toggle];
}

export default function App() {
  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState(null);
  const [page, setPage] = useState("shortlist");
  const [showTour, setShowTour] = useState(() => !localStorage.getItem("tour_done"));
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    getTopics().then((t) => {
      setTopics(t);
      if (t.length) setTopicId(t[0].id);
    });
  }, []);

  const isWide = page === "network";

  return (
    <div className="layout">
      {showTour && <Tour onClose={() => setShowTour(false)} />}

      <header className="topbar">
        <span className="topbar-title">Open Science Collaboration Network</span>

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

        <div className="topbar-actions">
          {topics.length > 0 && (
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <select
                className="topic-select"
                value={topicId ?? ""}
                onChange={(e) => setTopicId(Number(e.target.value))}
                style={{ paddingRight: "var(--sp-6)", appearance: "none", WebkitAppearance: "none" }}
              >
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <span style={{
                position: "absolute", right: "var(--sp-2)", pointerEvents: "none",
                color: "var(--text-3)", fontSize: "0.6rem", lineHeight: 1,
              }}>▾</span>
            </div>
          )}
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button
            className="icon-btn"
            onClick={() => setShowTour(true)}
            title="How it works"
            aria-label="Open tour"
          >?</button>
        </div>
      </header>

      <main key={page} className={`fade-in ${isWide ? "page-wide" : "page"}`}>
        {!topicId && <div className="spinner">Loading topics…</div>}
        {topicId && page === "shortlist" && <Shortlist topicId={topicId} />}
        {topicId && page === "network"   && <NetworkMap topicId={topicId} />}
        {topicId && page === "gaps"      && <GapView topicId={topicId} />}
      </main>
    </div>
  );
}
