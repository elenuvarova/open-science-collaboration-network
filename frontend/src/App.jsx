import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { getInstitution, getTopics } from "./api";
import Shortlist from "./pages/Shortlist";
import GapView from "./pages/GapView";
import DeadlineBanner from "./components/DeadlineBanner";
import Tour from "./components/Tour";
import RollingNumber from "./components/RollingNumber";
import useSlidingIndicator from "./hooks/useSlidingIndicator";
import MotionProvider from "./motion/MotionProvider";
import { AnimatePresence, m } from "motion/react";
import Icon from "./components/Icon";
import { track } from "./analytics";

// Cytoscape + layouts are ~500 KB — load them only when the map is opened.
const NetworkMap = lazy(() => import("./pages/NetworkMap"));
// Secondary pages load on first visit; Shortlist and Gaps stay in the main chunk.
const BriefView = lazy(() => import("./pages/BriefView"));
const SearchView = lazy(() => import("./pages/SearchView"));
const MethodologyView = lazy(() => import("./pages/MethodologyView"));
const CallsView = lazy(() => import("./pages/CallsView"));
const PipelineView = lazy(() => import("./pages/PipelineView"));
const CompareView = lazy(() => import("./pages/CompareView"));

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
  const shared = m[4] ? [...new Set(m[4].split(",").map(Number).filter((n) => n > 0))].slice(0, 30) : [];
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
  const topicsRef = useRef([]);
  topicsRef.current = topics;
  const [topicId, setTopicId] = useState(null);
  const [topicsError, setTopicsError] = useState(false);
  const [page, setPage] = useState(() => parseHash().page || "shortlist");
  // The institution profile open on the shortlist, deep-linked via the hash.
  // Only restore it when the hash actually points at the shortlist.
  const [profileId, setProfileId] = useState(() => {
    const h = parseHash();
    return (h.page ?? "shortlist") === "shortlist" ? (h.instId ?? null) : null;
  });
  // The first-visit tour opens by itself only on a plain visit. Someone arriving on a
  // link to a profile, a shared consortium or a comparison came for that, so the tour
  // waits (the ? button still opens it, and it shows on their next plain visit).
  const [showTour, setShowTour] = useState(() => {
    if (localStorage.getItem("tour_done")) return false;
    const h = parseHash();
    return !(h.instId || h.shared?.length || h.ids?.length);
  });

  // Per-view heading. On page change we move focus here so keyboard / screen-reader
  // users are taken to the new view and hear its name (WCAG 2.4.3 / 2.4.6).
  const headingRef = useRef(null);
  const pageLabel = HIDDEN_LABELS[page] || PAGES.find(p => p.id === page)?.label || "";
  // Not while the tour is open: its dialog owns focus (this effect runs after the
  // tour's own focus call and used to pull focus out of the modal).
  useEffect(() => { if (!showTour) headingRef.current?.focus(); setSharedNotice(null); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consortium is scoped per topic (an org's Partner Fit Score only means
  // something within the topic it was matched on) and persisted to localStorage
  // so it survives a page refresh — it's the user's only work product.
  const [consortiumByTopic, setConsortiumByTopic] = useState(loadConsortia);
  const consortiaRef = useRef(consortiumByTopic);
  consortiaRef.current = consortiumByTopic;
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
  // shared one. Read on load and on hashchange (a link pasted into an open tab);
  // the hash sync below then drops ?c from the URL.
  const [sharedNotice, setSharedNotice] = useState(null);
  const [sharedUndo, setSharedUndo] = useState(null);
  const [sharedIds, setSharedIds] = useState(() => parseHash().shared || []);
  useEffect(() => {
    const ids = sharedIds;
    if (topicId == null || !ids.length) return;
    setSharedIds([]);
    Promise.all(ids.map((id) => getInstitution(id, topicId).catch(() => null)))
      .then((rows) => {
        const found = rows.filter(Boolean);
        if (!found.length) return;
        // Replacing the user's own consortium is reversible: the notice offers Undo,
        // but only when there was one to restore.
        const previous = consortiaRef.current[topicId] || [];
        setConsortiumByTopic((prev) => ({ ...prev, [topicId]: found }));
        setSharedUndo(previous.length ? () => () => {
          setConsortiumByTopic((prev) => ({ ...prev, [topicId]: previous }));
          setSharedNotice(null);
        } : null);
        setSharedNotice(`Loaded a shared consortium of ${found.length} ${found.length === 1 ? "partner" : "partners"}.`);
        track("consortium_opened_shared", { topic: topicId, size: found.length });
      });
  }, [topicId, sharedIds]);
  // "Build consortium for this call" on the Calls page: remember the call and jump to
  // the shortlist (same topic — calls are matched per topic). activeCall drives the
  // DeadlineBanner shown above the shortlist and the gap view.
  // Stored per topic so it survives a reload and a call matched to one topic
  // never leaks into another topic's banner or outreach draft.
  const [callByTopic, setCallByTopic] = useState(() => {
    try { return JSON.parse(localStorage.getItem("active_call_by_topic") || "{}"); } catch { return {}; }
  });
  const activeCall = (topicId != null && callByTopic[topicId]) || null;
  function setActiveCall(call) {
    if (topicId == null) return;
    setCallByTopic((prev) => {
      const next = { ...prev };
      if (call) next[topicId] = call; else delete next[topicId];
      try { localStorage.setItem("active_call_by_topic", JSON.stringify(next)); } catch { /* non-fatal */ }
      return next;
    });
  }
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
          // A link whose topic doesn't exist must not overwrite another topic's work.
          if (!match) { setProfileId(null); setCompare([]); setSharedIds([]); }
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
      // The profile is part of the hash: #/shortlist/1/3572 opens it, #/shortlist/1 closes it.
      if ((h.page ?? "shortlist") === "shortlist") setProfileId(h.instId ?? null);
      if (h.topicId != null && topicsRef.current.some((t) => t.id === h.topicId)) setTopicId(h.topicId);
      if (h.shared?.length) setSharedIds(h.shared);
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

  // The active tab's pill slides between tabs; on the narrow, scrolling tab strip
  // the active tab is also brought into view.
  const navRef = useRef(null);
  useSlidingIndicator(navRef, page);
  useEffect(() => {
    const show = () => navRef.current?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    show();
    // Tab widths change once the web font arrives; bring the active tab back in view.
    document.fonts?.ready.then(show);
  }, [page]);

  // The map and the pipeline board want the full width (six columns).
  const isWide = page === "network" || page === "pipeline";

  return (
    <MotionProvider>
    <div className="layout">
      <AnimatePresence>
        {showTour && <Tour key="tour" onClose={() => setShowTour(false)} />}
      </AnimatePresence>

      <header className="topbar">
        <h1 className="topbar-title"><a className="brand" href="/" aria-label="noda — home"><span className="brand-dots" aria-hidden="true"><i /><i /><i /></span><span className="brand-word">noda</span></a></h1>

        <nav ref={navRef} className="has-indicator">
          <span className="indicator" aria-hidden="true" />
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={`nav-btn ${page === p.id ? "active" : ""}`}
              data-active={page === p.id}
              aria-current={page === p.id ? "page" : undefined}
              aria-label={p.id === "gaps" && consortium.length > 0
                ? `${p.label}, ${consortium.length} selected`
                : undefined}
              onClick={() => setPage(p.id)}
            >
              {p.label}
              {p.id === "gaps" && consortium.length > 0 && (
                <span className="nav-badge" aria-hidden="true"><RollingNumber value={consortium.length} /></span>
              )}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          {topics.length > 0 && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
              <span className="topbar-topic-label">Topic</span>
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
        <AnimatePresence>
          {sharedNotice && (
            <m.div key="shared" className="notice" role="status"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}>
              <Icon name="check" size={16} draw /> <span>{sharedNotice}</span>
              {sharedUndo && <button className="btn btn-secondary btn-sm" onClick={sharedUndo}>Undo — restore my consortium</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => setSharedNotice(null)}>Dismiss</button>
            </m.div>
          )}
        </AnimatePresence>
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
        {topicId && page === "shortlist" && <Shortlist topicId={topicId} consortium={consortium} onToggleConsortium={toggleConsortium} onGoToGaps={() => setPage("gaps")} onGoToPipeline={() => setPage("pipeline")} profileId={profileId} onOpenProfile={setProfileId} onCloseProfile={() => setProfileId(null)} compare={compare} onToggleCompare={toggleCompare} onClearCompare={() => setCompare([])} onOpenCompare={() => setPage("compare")} />}
        {topicId && page === "network"   && (
          <Suspense fallback={<div className="spinner" role="status" aria-live="polite">Loading the network…</div>}>
            <NetworkMap topicId={topicId} />
          </Suspense>
        )}
        {topicId && page === "gaps"      && <GapView topicId={topicId} consortium={consortium} onClearConsortium={clearConsortium} onToggleConsortium={toggleConsortium} />}
        <Suspense fallback={<div className="spinner" role="status" aria-live="polite">Loading…</div>}>
          {topicId && page === "pipeline"  && <PipelineView topicId={topicId} topicName={topics.find(t => t.id === topicId)?.name} consortium={consortium} activeCall={activeCall} />}
          {topicId && page === "calls"     && <CallsView topicId={topicId} topicName={topics.find(t => t.id === topicId)?.name} onBuildConsortium={startFromCall} />}
          {topicId && page === "brief"     && <BriefView topicId={topicId} />}
          {topicId && page === "search"    && <SearchView topicId={topicId} />}
          {topicId && page === "method"    && <MethodologyView />}
          {topicId && page === "compare"   && <CompareView topicId={topicId} topicName={topics.find(t => t.id === topicId)?.name} ids={compare.map(c => c.id)} consortium={consortium} onToggleConsortium={toggleConsortium} onOpenProfile={openProfileFromCompare} onBack={() => setPage("shortlist")} onResolve={resolveCompare} />}
        </Suspense>
      </main>
    </div>
    </MotionProvider>
  );
}
