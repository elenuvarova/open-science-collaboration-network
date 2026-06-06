import { useEffect, useRef, useState } from "react";
import { getTopics } from "./api";
import NetworkMap from "./pages/NetworkMap";
import Shortlist from "./pages/Shortlist";
import GapView from "./pages/GapView";
import BriefView from "./pages/BriefView";
import SearchView from "./pages/SearchView";
import Tour from "./components/Tour";
import ThemeToggle from "./components/ThemeToggle";

const PAGES = [
  { id: "shortlist", label: "Partner Shortlist" },
  { id: "network",   label: "Network Map" },
  { id: "gaps",      label: "Consortium Gaps" },
  { id: "brief",     label: "AI Brief" },
  { id: "search",    label: "Search" },
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

const CONSORTIUM_KEY = "consortium_by_topic";

function loadConsortia() {
  try {
    const raw = localStorage.getItem(CONSORTIUM_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const VALID_PAGES = new Set(PAGES.map(p => p.id));

// Hash format: #/<page>/<topicId>[/<institutionId>] — e.g. #/shortlist/3/445.
// All parts optional and guarded so a malformed hash never throws. The third
// segment deep-links an open institution profile (only used on the shortlist).
function parseHash() {
  const m = (window.location.hash || "").match(/^#\/([a-z]+)(?:\/(\d+))?(?:\/(\d+))?/i);
  if (!m) return {};
  const page = VALID_PAGES.has(m[1]) ? m[1] : undefined;
  const topicId = m[2] != null ? Number(m[2]) : undefined;
  const instId = m[3] != null ? Number(m[3]) : undefined;
  return { page, topicId, instId };
}

export default function App() {
  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState(null);
  const [topicsError, setTopicsError] = useState(false);
  const [page, setPage] = useState(() => parseHash().page || "shortlist");
  // The institution profile open on the shortlist, deep-linked via the hash.
  // Only restore it when the hash actually points at the shortlist.
  const [profileId, setProfileId] = useState(() => {
    const h = parseHash();
    return (h.page ?? "shortlist") === "shortlist" ? (h.instId ?? null) : null;
  });
  const [showTour, setShowTour] = useState(() => !localStorage.getItem("tour_done"));
  const [theme, toggleTheme] = useTheme();

  // Per-view heading. On page change we move focus here so keyboard / screen-reader
  // users are taken to the new view and hear its name (WCAG 2.4.3 / 2.4.6).
  const headingRef = useRef(null);
  const pageLabel = PAGES.find(p => p.id === page)?.label || "";
  useEffect(() => { headingRef.current?.focus(); }, [page]);

  // Consortium is scoped per topic (an org's Partner Fit Score only means
  // something within the topic it was matched on) and persisted to localStorage
  // so it survives a page refresh — it's the user's only work product.
  const [consortiumByTopic, setConsortiumByTopic] = useState(loadConsortia);
  const consortium = (topicId != null && consortiumByTopic[topicId]) || [];

  useEffect(() => {
    try { localStorage.setItem(CONSORTIUM_KEY, JSON.stringify(consortiumByTopic)); }
    catch { /* quota / private mode — non-fatal */ }
  }, [consortiumByTopic]);

  function toggleConsortium(inst) {
    if (topicId == null) return;
    setConsortiumByTopic(prev => {
      const cur = prev[topicId] || [];
      const next = cur.find(i => i.id === inst.id)
        ? cur.filter(i => i.id !== inst.id)
        : [...cur, inst];
      return { ...prev, [topicId]: next };
    });
  }

  function clearConsortium() {
    if (topicId == null) return;
    setConsortiumByTopic(prev => ({ ...prev, [topicId]: [] }));
  }

  function loadTopics() {
    setTopicsError(false);
    getTopics()
      .then((t) => {
        setTopics(t);
        if (t.length) {
          // Honour a topic from the URL hash if it exists; otherwise default to first.
          const wanted = parseHash().topicId;
          const match = wanted != null && t.find(x => x.id === wanted);
          setTopicId(match ? wanted : t[0].id);
          // A deep-linked profile only makes sense under its own topic — if the
          // hashed topic didn't resolve, drop the stale profile so it can't render
          // an institution that belongs to a different topic.
          if (!match) setProfileId(null);
        }
      })
      .catch(() => setTopicsError(true));
  }

  useEffect(() => { loadTopics(); }, []);

  // Keep the URL hash in sync with page + topic (+ open profile on the shortlist)
  // so refresh restores the view and it's shareable. replaceState avoids polluting
  // browser history on every change.
  useEffect(() => {
    if (topicId == null) return;
    const base = `#/${page}/${topicId}`;
    const next = page === "shortlist" && profileId != null ? `${base}/${profileId}` : base;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [page, topicId, profileId]);

  const isWide = page === "network";

  return (
    <div className="layout">
      {showTour && <Tour onClose={() => setShowTour(false)} />}

      <header className="topbar">
        <h1 className="topbar-title">Open Science Collaboration Network</h1>

        <nav>
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={`nav-btn ${page === p.id ? "active" : ""}`}
              aria-current={page === p.id ? "page" : undefined}
              aria-label={p.id === "gaps" && consortium.length > 0
                ? `${p.label}, ${consortium.length} selected`
                : undefined}
              onClick={() => setPage(p.id)}
            >
              {p.label}
              {p.id === "gaps" && consortium.length > 0 && (
                <span className="nav-badge" aria-hidden="true">{consortium.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          {topics.length > 0 && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
              <span style={{
                fontSize: "var(--text-xs)", color: "var(--text-3)",
                fontWeight: "var(--w-medium)", textTransform: "uppercase",
                letterSpacing: "var(--track-caption)", whiteSpace: "nowrap",
              }}>Topic</span>
              <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <select
                  className="topic-select"
                  value={topicId ?? ""}
                  onChange={(e) => { setTopicId(Number(e.target.value)); setProfileId(null); }}
                  style={{ paddingRight: "var(--sp-6)", appearance: "none", WebkitAppearance: "none" }}
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <span style={{
                  position: "absolute", right: "var(--sp-2)", pointerEvents: "none",
                  color: "var(--text-3)", fontSize: "var(--text-sm)", lineHeight: 1,
                }}>▾</span>
              </span>
            </label>
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
        <h2 className="sr-only" tabIndex={-1} ref={headingRef}>{pageLabel}</h2>
        {!topicId && !topicsError && <div className="spinner" role="status" aria-live="polite">Loading topics…</div>}
        {!topicId && topicsError && (
          <div className="card" role="alert" style={{ textAlign: "center", padding: "var(--sp-8)", maxWidth: 440, margin: "var(--sp-10) auto 0" }}>
            <div style={{ fontSize: "var(--text-3xl)", marginBottom: "var(--sp-2)" }} aria-hidden="true">⚠️</div>
            <div className="subhead" style={{ marginBottom: "var(--sp-2)" }}>
              Couldn’t reach the server
            </div>
            <p className="muted" style={{ marginBottom: "var(--sp-4)" }}>
              The service may be waking up. Give it a moment and try again.
            </p>
            <button className="btn btn-primary" onClick={loadTopics}>Retry</button>
          </div>
        )}
        {topicId && page === "shortlist" && <Shortlist topicId={topicId} consortium={consortium} onToggleConsortium={toggleConsortium} onGoToGaps={() => setPage("gaps")} profileId={profileId} onOpenProfile={setProfileId} onCloseProfile={() => setProfileId(null)} />}
        {topicId && page === "network"   && <NetworkMap topicId={topicId} />}
        {topicId && page === "gaps"      && <GapView topicId={topicId} consortium={consortium} onClearConsortium={clearConsortium} />}
        {topicId && page === "brief"     && <BriefView topicId={topicId} />}
        {topicId && page === "search"    && <SearchView topicId={topicId} />}
      </main>
    </div>
  );
}
