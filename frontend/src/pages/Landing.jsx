import { useEffect, useMemo, useState } from "react";
import { getTopics, getInstitutions, getMeta } from "../api";
import Icon from "../components/Icon";
import TypeBadge from "../components/TypeBadge";
import Odometer from "../components/Odometer";
import { track } from "../analytics";

// Shown until the API answers (and if it never does) — real values from Oct 2026.
const FALLBACK_TOPICS = [
  { id: 1, name: "Climate adaptation" }, { id: 2, name: "AI in education" },
  { id: 6, name: "Biodiversity conservation" }, { id: 4, name: "Circular economy" },
  { id: 5, name: "Digital health" }, { id: 3, name: "Soil health" },
];
const FALLBACK_ROWS = [
  { id: 304, name: "Centre National de la Recherche Scientifique", type: "government", country: "FR", recent_works: 98, eu_projects: 63, partner_fit_score: 95 },
  { id: 3572, name: "Wageningen University & Research", type: "education", country: "NL", recent_works: 59, eu_projects: 23, partner_fit_score: 93 },
  { id: 1644, name: "ETH Zurich", type: "education", country: "CH", recent_works: 56, eu_projects: 22, partner_fit_score: 93 },
  { id: 0, name: "Potsdam Institute for Climate Impact Research", type: "facility", country: "DE", recent_works: 46, eu_projects: 24, partner_fit_score: 92 },
];

const STEPS = [
  { n: "01", icon: "network-node", kind: "education", title: "Map who works on it",
    body: "Every institution publishing on the topic, linked by shared papers and EU projects. Clusters show who already works together." },
  { n: "02", icon: "check", kind: "public", title: "Score how well they fit",
    body: "A Partner Fit Score from six signals — topic relevance, output, EU projects, centrality, country spread and recent activity." },
  { n: "03", icon: "search", kind: "ngo", title: "Fill the gaps",
    body: "Add partners to your consortium and see which roles are covered: research lead, technical, policy, NGO, impact, geography." },
];

const SOURCES = [
  { name: "OpenAlex", licence: "CC0", body: "Works, authors and institutions — who publishes on what, and with whom." },
  { name: "CORDIS", licence: "CC BY 4.0", body: "EU-funded projects and their participants since 2014." },
  { name: "ROR", licence: "CC0", body: "Stable identifiers and types for every research organisation." },
];

const appLink = (topicId) => (topicId ? `/app#/shortlist/${topicId}` : "/app");

// Prerendered with these, then replaced by live totals from /api/meta.
const FALLBACK_META = { topics: 6, institutions: 9431, edges: 860000 };

function compact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  return n.toLocaleString("en-GB");
}

export default function Landing() {
  const [topics, setTopics] = useState(FALLBACK_TOPICS);
  const [rows, setRows] = useState(FALLBACK_ROWS);
  const [meta, setMeta] = useState(FALLBACK_META);

  useEffect(() => {
    document.title = "noda — find research partners before you write the grant";
    getTopics().then((t) => { if (t?.length) setTopics(t); }).catch(() => {});
    getMeta().then((m) => { if (m?.institutions) setMeta(m); }).catch(() => {});
    getInstitutions({ topic: 1, limit: 4 })
      .then((r) => { const list = r?.items ?? r; if (list?.length) setRows(list.slice(0, 4)); })
      .catch(() => {});
  }, []);

  const climate = topics.find((t) => /climate/i.test(t.name)) || topics[0];

  return (
    <div className="lp">
      <a className="sr-only sr-only-focusable" href="#main">Skip to content</a>

      <header className="lp-nav">
        <a className="brand" href="/" aria-label="noda — home">
          <span className="brand-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-word">noda</span>
        </a>
        <nav aria-label="Page" className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#data">Data</a>
          <a href="#topics">Topics</a>
        </nav>
        <a className="lp-btn lp-btn-primary" href="/app" onClick={() => track("landing_cta", { where: "nav" })}>Open the app</a>
      </header>

      <main id="main">
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Open data · OpenAlex · CORDIS · ROR</p>
            <h1 className="lp-h1">
              Find your <mark>partners</mark><br />before you write<br />the grant
            </h1>
            <p className="lp-lead">
              See who already works on your topic, how well each institution would fit your
              consortium, and which roles are still missing — scored from open data, refreshed every week.
            </p>
            <div className="lp-ctas">
              <a className="lp-btn lp-btn-primary" href={appLink(climate?.id)} onClick={() => track("landing_cta", { where: "hero" })}>
                Explore {climate?.name?.toLowerCase() || "a topic"}
              </a>
              <a className="lp-btn lp-btn-secondary" href="#how">How the score works</a>
            </div>
            <ul className="lp-topics" id="topics" aria-label="Topics">
              {topics.map((t) => (
                <li key={t.id}>
                  <a href={appLink(t.id)} onClick={() => track("landing_topic", { topic: t.id })}>{t.name}</a>
                </li>
              ))}
            </ul>
          </div>
          <Constellation />
        </section>

        <section className="lp-band" aria-label="noda in numbers">
          {[[String(meta.topics), "research topics"], [compact(meta.institutions), "institutions scored"], [compact(meta.edges), "collaboration links"], ["weekly", "refresh from OpenAlex + CORDIS"]].map(([v, l]) => (
            <div key={l} className="lp-reveal"><p className="lp-band-value"><Odometer value={v} /></p><p>{l}</p></div>
          ))}
        </section>

        <section className="lp-section" id="how" aria-labelledby="how-h">
          <h2 id="how-h" className="lp-h2">How it works</h2>
          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li key={s.n} className="lp-step lp-reveal">
                <div className="lp-step-top">
                  <span className="lp-step-n" aria-hidden="true">{s.n}</span>
                  <span className={`lp-step-icon type-${s.kind}`}><Icon name={s.icon} size={22} /></span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-preview" aria-labelledby="prev-h">
          <div className="lp-preview-copy lp-reveal">
            <h2 id="prev-h" className="lp-h2">A shortlist you can defend</h2>
            <p>
              Every score breaks down into its parts, so you can explain to a coordinator why a partner
              is on the list — and add them to the consortium in one click.
            </p>
            <a className="lp-btn lp-btn-primary" href={appLink(climate?.id)} onClick={() => track("landing_cta", { where: "preview" })}>Open the shortlist</a>
          </div>
          <ol className="lp-rows lp-reveal" aria-label={`Top partners for ${climate?.name || "climate adaptation"}`}>
            {rows.map((r, i) => (
              <li key={r.id || r.name} className="lp-row">
                <span className="lp-row-rank">{i + 1}</span>
                <span className="lp-row-main">
                  <span className="lp-row-name">{r.name}</span>
                  <span className="lp-row-meta">
                    <TypeBadge type={r.type} />
                    {[r.country, r.recent_works != null && `${r.recent_works} works`, r.eu_projects != null && `${r.eu_projects} EU projects`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="lp-row-score">{Math.round(r.partner_fit_score)}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-sources" id="data" aria-labelledby="data-h">
          <h2 id="data-h" className="lp-h2">Built on open data</h2>
          <ul>
            {SOURCES.map((s) => (
              <li key={s.name} className="lp-reveal">
                <h3>{s.name} <span className="lp-licence">{s.licence}</span></h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-final lp-reveal">
          <h2 className="lp-h1">Start with your topic</h2>
          <a className="lp-btn lp-btn-primary" href="/app" onClick={() => track("landing_cta", { where: "final" })}>Open the app</a>
        </section>
      </main>

      <footer className="lp-footer">
        <span>noda · a portfolio project · <a href="/app#/method/1">How scores are made</a></span>
        <span>Data: OpenAlex (CC0) · CORDIS (CC BY 4.0) · ROR (CC0)</span>
      </footer>
    </div>
  );
}

// Decorative network: beads (institutions) on threads (co-authorship), one red pair.
// Seeded so it renders the same every time; hidden from assistive tech.
function Constellation() {
  const { nodes, edges, hubs } = useMemo(() => {
    let seed = 9;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const kinds = ["education", "public", "company", "ngo", "health", "facility", "other"];
    const hubs = [[200, 190, "education"], [380, 240, "public"], [260, 400, "ngo"], [430, 420, "health"]];
    const nodes = [], edges = [];
    for (let i = 0; i < 44; i++) {
      const [hx, hy, hk] = hubs[i % 4];
      const a = rnd() * 6.28, d = 50 + rnd() * 120;
      const x = hx + Math.cos(a) * d, y = hy + Math.sin(a) * d * 0.9;
      const r = 4 + Math.round(rnd() * 2) * 4;
      const kind = rnd() < 0.6 ? hk : kinds[Math.floor(rnd() * kinds.length)];
      nodes.push({ x, y, r, kind });
      edges.push([x, y, hx, hy]);
    }
    return { nodes, edges, hubs };
  }, []);
  const fill = (k) => `var(--type-${k}-bg)`;
  // One wave from the first hub: hubs appear, threads draw outward from them, and
  // each bead lands as its thread arrives. Delays grow with distance from the seed.
  // Delays come as classes in 50 ms steps (lp-d-0 … lp-d-31 in landing.css), not
  // inline styles: the prerendered page carries no style attributes, so the CSP
  // needs no 'unsafe-inline'.
  const [sx, sy] = hubs[0];
  const wave = (x, y, extra = 0) => `lp-d-${Math.min(31, Math.round((Math.hypot(x - sx, y - sy) * 1.6 + extra) / 50))}`;
  return (
    <svg className="lp-constellation" viewBox="0 0 560 560" aria-hidden="true" focusable="false">
      {edges.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x2} y1={y2} x2={x1} y2={y1} pathLength={1} className={`lp-edge ${wave(x2, y2, 150)}`} />
      ))}
      <line x1={hubs[0][0]} y1={hubs[0][1]} x2={hubs[1][0]} y2={hubs[1][1]} pathLength={1} className="lp-pair" />
      {nodes.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={fill(n.kind)} className={`lp-bead ${wave(n.x, n.y, 450)}`} />)}
      {hubs.map(([x, y, k], i) => <circle key={`h${i}`} cx={x} cy={y} r={20} fill={fill(k)} className={`lp-bead ${wave(x, y)}`} />)}
      {[hubs[0], hubs[1]].map(([x, y], i) => <circle key={`r${i}`} cx={x} cy={y} r={30} className="lp-ring" />)}
    </svg>
  );
}
