import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { getInstitution, getTopics } from "./api";
import Shortlist from "./pages/Shortlist";
import GapView from "./pages/GapView";
import BriefView from "./pages/BriefView";
import SearchView from "./pages/SearchView";
import MethodologyView from "./pages/MethodologyView";
import CallsView from "./pages/CallsView";
import PipelineView from "./pages/PipelineView";
import DeadlineBanner from "./components/DeadlineBanner";
import Tour from "./components/Tour";
import Icon from "./components/Icon";
import { track } from "./analytics";

// Cytoscape + layouts are ~500 KB — load them only when the map is opened.
const NetworkMap = lazy(() => import("./pages/NetworkMap"));

const PAGES = [
  { id: "shortlist", label: "Partner Shortlist" },
  { id: "network",   label: "Network Map" },
  { id: "gaps",      label: "Consortium Gaps" },
  { id: "pipeline",  label: "Pipeline" },
  { id: "calls",    label: "Calls" },
  { id: "brief",     label: "AI Brief" },
  { id: "search",    label: "Search" },
];


const CONSORTIUM_KEY = "consortium_by_topic";

function loadConsortia() {
  try {
    const raw = localStorage.getItem(CONSORTIUM_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// "method" is reachable by link (data stamp, landing footer) but has no nav tab.
const VALID_PAGES = new Set([...PAGES.map(p => p.id), "method"]);

// Hash format: #/<page>/<topicId>[/<institutionId>][?c=<id>,<id>…] — e.g. #/shortlist/3/445.
// ?c= carries a shared consortium (see "Copy share link" in the Gap view).
// All parts optional and guarded so a malformed hash never throws. The third
// segment deep-links an open institution profile (only used on the shortlist).
function parseHash() {
  const m = (window.location.hash || "").match(/^#\/([a-z]+)(?:\/(\d+))?(?:\/(\d+))?(?:\?c=([\d,]+))?/i);
  if (!m) return {};
  const shared = m[4] ? m[4].split(",").filter(Boolean).map(Number).slice(0, 30) : [];
  const page = VALID_PAGES.has(m[1]) ? m[1] : undefined;
  const topicId = m[2] != null ? Number(m[2]) : undefined;
  const instId = m[3] != null ? Number(m[3]) : undefined;
  return { page, topicId, instId, shared };
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

  // Per-view heading. On page change we move focus here so keyboard / screen-reader
  // users are taken to the new view and hear its name (WCAG 2.4.3 / 2.4.6).
  const headingRef = useRef(null);
  const pageLabel = page === "method" ? "Methodology" : (PAGES.find(p => p.id === page)?.label || "");
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
      const removing = !!cur.find(i => i.id === inst.id);
      const next = removing ? cur.filter(i => i.id !== inst.id) : [...cur, inst];
      track(removing ? "partner_removed" : "partner_added", { topic: topicId, size: next.length });
      return { ...prev, [topicId]: next };
    });
  }

  // A shared link (#/gaps/3?c=12,45) replaces this topic's consortium with the
  // shared one. Read once on load; the hash sync below then drops ?c from the URL.
  const [sharedNotice, setSharedNotice] = useState(null);
  const sharedRef = useRef(parseHash().shared || []);
  useEffect(() => {
    const ids = sharedRef.current;
    if (topicId == null || !ids.length) return;
    sharedRef.current = [];
    Promise.all(ids.map((id) => getInstitution(id, topicId).catch(() => null)))
      .then((rows) => {
        const found = rows.filter(Boolean);
        if (!found.length) return;
        setConsortiumByTopic((prev) => ({ ...prev, [topicId]: found }));
        setSharedNotice(`Loaded a shared consortium of ${found.length} ${found.length === 1 ? "partner" : "partners"}.`);
        track("consortium_opened_shared", { topic: topicId, size: found.length });
      });
  }, [topicId]);
  // "Build consortium for this call" on the Calls page: remember the call and jump to
  // the shortlist (same topic — calls are matched per topic). activeCall drives the
  // DeadlineBanner shown above the shortlist and the gap view.
  const [activeCall, setActiveCall] = useState(null);
  function startFromCall(call) {
    setActiveCall(call);
    setProfileId(null);
    setPage("shortlist");
    track("call_consortium_started", { topic: topicId });
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

  // In-app links (the data stamp's "How scores are made", a pasted URL) change the
  // hash directly; follow them. replaceState below never fires hashchange.
  useEffect(() => {
    const onHash = () => {
      const h = parseHash();
      if (h.page) setPage(h.page);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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

  // The map and the pipeline board want the full width (six columns).
  const isWide = page === "network" || page === "pipeline";

  return (
    <div className="layout">
      {showTour && <Tour onClose={() => setShowTour(false)} />}

      <header className="topbar">
        <h1 className="topbar-title"><a className="brand" href="/" aria-label="noda — home"><span className="brand-dots" aria-hidden="true"><i /><i /><i /></span><span className="brand-word">noda</span></a></h1>

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
                  onChange={(e) => { setTopicId(Number(e.target.value)); setProfileId(null); track("topic_changed", { topic: Number(e.target.value) }); }}
                  style={{ paddingRight: "var(--sp-6)", appearance: "none", WebkitAppearance: "none" }}
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <span style={{
                  position: "absolute", right: "var(--sp-2)", pointerEvents: "none",
                  color: "var(--text-3)", fontSize: "var(--text-sm)", lineHeight: 1,
                }}><Icon name="chevron-down" size={12} /></span>
              </span>
            </label>
          )}
          <button
            className="icon-btn"
            onClick={() => setShowTour(true)}
            title="How it works"
            aria-label="Open tour"
          ><Icon name="help" size={16} /></button>
        </div>
      </header>

      <main key={page} className={`fade-in ${isWide ? "page-wide" : "page"}`}>
        <h2 className="sr-only" tabIndex={-1} ref={headingRef}>{pageLabel}</h2>
        {sharedNotice && (
          <div className="notice" role="status">
            <Icon name="check" size={16} /> <span>{sharedNotice}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setSharedNotice(null)}>Dismiss</button>
          </div>
        )}
        {!topicId && !topicsError && <div className="spinner" role="status" aria-live="polite">Loading topics…</div>}
        {!topicId && topicsError && (
          <div className="card" role="alert" style={{ textAlign: "center", padding: "var(--sp-8)", maxWidth: 440, margin: "var(--sp-10) auto 0" }}>
            <div style={{ color: "var(--text-2)", marginBottom: "var(--sp-2)" }}><Icon name="alert" size={36} /></div>
            <div className="subhead" style={{ marginBottom: "var(--sp-2)" }}>
              Couldn’t reach the server
            </div>
            <p className="muted" style={{ marginBottom: "var(--sp-4)" }}>
              The service may be waking up. Give it a moment and try again.
            </p>
            <button className="btn btn-primary" onClick={loadTopics}>Retry</button>
          </div>
        )}
        {activeCall && (page === "shortlist" || page === "gaps") && (
          <DeadlineBanner call={activeCall} onDismiss={() => setActiveCall(null)} onOpenPortal={() => track("call_opened", { topic: topicId })} />
        )}
        {page === "gaps" && consortium.length > 0 && (
          // GapView stays untouched; this is its way into the pipeline.
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--sp-2)" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage("pipeline")}>→ Track outreach</button>
          </div>
        )}
        {topicId && page === "shortlist" && <Shortlist topicId={topicId} consortium={consortium} onToggleConsortium={toggleConsortium} onGoToGaps={() => setPage("gaps")} onGoToPipeline={() => setPage("pipeline")} profileId={profileId} onOpenProfile={setProfileId} onCloseProfile={() => setProfileId(null)} />}
        {topicId && page === "network"   && (
          <Suspense fallback={<div className="spinner" role="status" aria-live="polite">Loading the network…</div>}>
            <NetworkMap topicId={topicId} />
          </Suspense>
        )}
        {topicId && page === "gaps"      && <GapView topicId={topicId} consortium={consortium} onClearConsortium={clearConsortium} onToggleConsortium={toggleConsortium} />}
        {topicId && page === "pipeline"  && <PipelineView topicId={topicId} topicName={topics.find(t => t.id === topicId)?.name} consortium={consortium} activeCall={activeCall} />}
        {topicId && page === "calls"     &&<CallsView topicId={topicId} topicName={topics.find(t => t.id === topicId)?.name} onBuildConsortium={startFromCall} />}
        {topicId && page === "brief"     && <BriefView topicId={topicId} />}
        {topicId && page === "search"    && <SearchView topicId={topicId} />}
        {topicId && page === "method"    && <MethodologyView />}
      </main>
    </div>
  );
}
