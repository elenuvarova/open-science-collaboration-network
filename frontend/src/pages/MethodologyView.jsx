import { useEffect, useState } from "react";
import { loadMeta, formatDate } from "../components/DataStamp";
import { SCORE_LABELS, SCORE_MAX } from "../components/scoreMeta";

const n = (v) => (v == null ? "—" : Number(v).toLocaleString("en-GB"));

// Plain description of each signal, matching etl/run.py exactly — not the marketing version.
const HOW = {
  topic_relevance: "Percentile rank of the institution’s number of works on this topic within the topic’s cohort.",
  publication_activity: "The same work count on a log scale, relative to the most productive institution.",
  eu_project_participation: "Percentile rank of the number of matched EU projects (CORDIS) on this topic.",
  network_centrality: "Percentile rank of degree centrality in the co-authorship and co-project graph.",
  country_diversity: "Full points for institutions in 14 focus countries, half points elsewhere.",
  recent_activity: "Share of the institution’s works in the sample dated 2024 or later.",
};

export default function MethodologyView() {
  const [meta, setMeta] = useState(null);
  useEffect(() => { loadMeta().then(setMeta); }, []);
  const date = formatDate(meta?.data_as_of);

  return (
    <article className="method">
      <header className="method-head">
        <p className="eyebrow">Methodology</p>
        <h2 className="method-title">How noda scores partners</h2>
        <p className="method-lead">
          Every number in noda comes from open data and one weekly batch job. This page says what goes in, how the
          Partner Fit Score is calculated, and what it does not tell you.
        </p>
        <dl className="method-stats">
          <div><dt>Data as of</dt><dd>{date || "—"}</dd></div>
          <div><dt>Institutions scored</dt><dd>{n(meta?.institutions)}</dd></div>
          <div><dt>Collaboration links</dt><dd>{n(meta?.edges)}</dd></div>
          <div><dt>EU projects</dt><dd>{n(meta?.projects)}</dd></div>
        </dl>
      </header>

      <section aria-labelledby="m-data">
        <h3 id="m-data">Where the data comes from</h3>
        <ul>
          <li><b>OpenAlex</b> (CC0). For each topic, the 1,000 most-cited works from 2020–2025 with at least one European institution. Co-authorship between institutions becomes a link in the network.</li>
          <li><b>CORDIS</b> (CC BY 4.0). Horizon Europe and Horizon 2020 projects whose title or abstract matches the topic’s keywords. Shared projects become links too.</li>
          <li><b>CORDIS outputs</b> (CC BY 4.0). The public deliverables and publications CORDIS lists for each Horizon Europe and Horizon 2020 project, behind the delivery record on an institution’s profile. They are counted per project and summed over the EU projects matched to the institution, so they describe the projects, not the partner: no deliverable is credited to one member of a consortium. A project with none listed may simply be too recent. Publications of any type count, and CORDIS doesn’t say whether they are open access.</li>
          <li><b>ROR</b> (CC0). Organisation identifiers and types (education, company, government…), used for the type badges and the roles in Consortium Gaps.</li>
        </ul>
      </section>

      <section aria-labelledby="m-match">
        <h3 id="m-match">Matching EU projects to institutions</h3>
        <p>
          CORDIS and OpenAlex share no identifier. Names are compared within the same country by fuzzy matching.
          Matches scoring 90 or more are accepted. Matches scoring 75–90 are checked against ROR when ROR knows the
          organisation, and otherwise accepted on name similarity alone, which can occasionally pair the wrong
          organisation. Anything below 75 is left out rather than guessed. Universities and research institutes match well; small companies with inconsistent
          names often don’t, so their EU project counts can be too low.
        </p>
      </section>

      <section aria-labelledby="m-score">
        <h3 id="m-score">The Partner Fit Score</h3>
        <p>Six signals, each scaled to 0–1 and weighted. The weights add up to 100 points.</p>
        <div className="method-table-wrap">
          <table className="method-table">
            <thead><tr><th scope="col">Signal</th><th scope="col">Points</th><th scope="col">How it’s measured</th></tr></thead>
            <tbody>
              {Object.keys(SCORE_MAX).map((k) => (
                <tr key={k}><th scope="row">{SCORE_LABELS[k]}</th><td>{SCORE_MAX[k]}</td><td>{HOW[k]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>You can change the weights on the Partner Shortlist. The ranking updates on the spot and nothing is saved.</p>
      </section>

      <section aria-labelledby="m-not">
        <h3 id="m-not">What the score is not</h3>
        <ul>
          <li><b>Not a quality rating.</b> It estimates fit for a consortium on one topic, not how good an institution is.</li>
          <li><b>Output counts twice.</b> Topic relevance and publication activity both come from the same work count, so half the score rewards volume.</li>
          <li><b>It favours large, established institutions.</b> Counts come from the 1,000 most-cited works, not from everything published.</li>
          <li><b>“Country diversity” is a bonus, not a measure.</b> It gives full points to 14 focus countries and doesn’t yet look at your consortium.</li>
          <li><b>Recent work is under-counted.</b> New papers have had less time to be cited, so fewer of them reach the most-cited sample.</li>
        </ul>
        <p>These are known limits, listed here so the ranking can be read with the right amount of trust.</p>
      </section>
    </article>
  );
}
