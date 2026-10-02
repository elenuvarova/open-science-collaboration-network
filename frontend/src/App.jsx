import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { getInstitution, getTopics } from "./api";
import Shortlist from "./pages/Shortlist";
import GapView from "./pages/GapView";
import BriefView from "./pages/BriefView";
import SearchView from "./pages/SearchView";
import MethodologyView from "./pages/MethodologyView";
import CallsView from "./pages/CallsView";
import CompareView from "./pages/CompareView";
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
  { id: "calls",     label: "Calls" },
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

// "method" and "compare" are reachable by link but have no nav tab: "method" from the
// data stamp and landing footer, "compare" from the shortlist's compare tray.
const VALID_PAGES = new Set([...PAGES.map(p => p.id), "method", "compare"]);
const HIDDEN_LABELS = { method: "Methodology", compare: "Compare partners" };
const MAX_COMPARE = 4;

// Hash format: #/<page>/<topicId>[/<institutionId>][?c=<id>,<id>…] — e.g. #/shortlist/3/445.
// ?c= carries a shared consortium (see "Copy share link" in the Gap view).
// ?ids= carries the partners being compared (#/compare/3?ids=12,45,78, at most 4).
// All parts optional and guarded so a malformed hash never throws. The third
// segment deep-links an open institution profile (only used on the shortlist).
function parseHash() {
  const m = (window.location.hash || "").match(/^#\/([a-z]+)(?:\/(\d+))?(?:\/(\d+))?(?:\?(?:c=([\d,]+)|ids=([\d,]+)))?/i);
  if (!m) return {};
  const shared = m[4] ? m[4].split(",").filter(Boolean).map(Number).slice(0, 30) : [];
  const ids = m[5]
    ? [...new Set(m[5].split(",").filter(Boolean).map(Number).filter((n) => n > 0))].slice(0, MAX_COMPARE)
    : [];
  const page = VALID_PAGES.has(m[1]) ? m[1] : undefined;
  const topicId = m[2] != null ? Number(m[2]) : undefined;
  const instId = m[3] != null ? Number(m[3]) : undefined;
  return { page, topicId, instId, shared, ids };
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
  const pageLabel = HIDDEN_LABELS[page] || PAGES.find(p => p.id === page)?.label || "";
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

  // Partners picked for side-by-side comparison on the shortlist: [{ id, name }], at
  // most MAX_COMPARE, for the current topic only (a score only means something within
  // its topic). Kept here so the picks survive the trip to the compare page and back.
  // A deep link (#/compare/3?ids=1,2) supplies bare ids; the compare page fills in names.
  const [compare, setCompare] = useState(() => {
    const h = parseHash();
    return h.page === "compare" ? (h.ids || []).map(id => ({ id, name: "" })) : [];
  });
  function toggleCompare(inst) {
    setCompare(prev => {
      if (prev.some(c => c.id === inst.id)) return prev.filter(c => c.id !== inst.id);
      return prev.length >= MAX_COMPARE ? prev : [...prev, { id: inst.id, name: inst.name }];
    });
  }
  // The compare page reports the institutions it loaded; fill in any missing names.
  function resolveCompare(rows) {
    setCompare(prev => {
      const next = prev.map(c => {
        const r = rows.find(x => x.id === c.id);
        return r && r.name !== c.name ? { id: c.id, name: r.name } : c;
      });
      return next.every((c, i) => c === prev[i]) ? prev : next;
    });
  }
  function openProfileFromCompare(id) {
    setProfileId(id);
    setPage("shortlist");
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
          if (!match) { setProfileId(null); setCompare([]); }
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
      if (h.page === "compare" && h.ids.length) {
        setCompare(prev => h.ids.map(id => prev.find(c => c.id === id) || { id, name: "" }));
      }
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
    let next = base;
    if (page === "shortlist" && profileId != null) next = `${base}/${profileId}`;
    else if (page === "compare" && compare.length) next = `${base}?ids=${compare.map(c => c.id).join(",")}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [page, topicId, profileId, compare]);

  const isWide = page === "network";

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
                  onChange={(e) => { setTopicId(Number(e.target.value)); setProfileId(null); setCompare([]); track("topic_changed", { topic: Number(e.target.value) }); }}
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
        {topicId && page === "shortlist" && <Shortlist topicId={topicId} consortium={consortium} onToggleConsortium={toggleConsortium} onGoToGaps={() => setPage("gaps")} profileId={profileId} onOpenProfile={setProfileId} onCloseProfile={() => setProfileId(null)} compare={compare} onToggleCompare={toggleCompare} onClearCompare={() => setCompare([])} onOpenCompare={() => setPage("compare")} />}
        {topicId && page === "network"   && (
          <Suspense fallback={<div className="spinner" role="status" aria-live="polite">Loading the network…</div>}>
            <NetworkMap topicId={topicId} />
          </Suspense>
        )}
        {topicId && page === "gaps"      && <GapView topicId={topicId} consortium={consortium} onClearConsortium={clearConsortium} onToggleConsortium={toggleConsortium} />}
        {topicId && page === "calls"     && <CallsView topicId={topicId} topicName={topics.find(t => t.id === topicId)?.name} onBuildConsortium={startFromCall} />}
        {topicId && page === "brief"     && <BriefView topicId={topicId} />}
        {topicId && page === "search"    && <SearchView topicId={topicId} />}
        {topicId && page === "method"    && <MethodologyView />}
        {topicId && page === "compare"   && <CompareView topicId={topicId} topicName={topics.find(t => t.id === topicId)?.name} ids={compare.map(c => c.id)} consortium={consortium} onToggleConsortium={toggleConsortium} onOpenProfile={openProfileFromCompare} onBack={() => setPage("shortlist")} onResolve={resolveCompare} />}
      </main>
    </div>
  );
}
