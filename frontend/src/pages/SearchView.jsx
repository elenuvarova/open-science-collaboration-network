import { useEffect, useRef, useState } from "react";
import { searchWorks } from "../api";

function SimilarityBar({ value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
      <div style={{
        flex: 1, height: 4,
        background: "var(--border)",
        borderRadius: "var(--r-full)",
        overflow: "hidden",
        maxWidth: 80,
      }}>
        <div style={{
          height: "100%",
          width: `${Math.round(value * 100)}%`,
          background: "var(--accent)",
          borderRadius: "var(--r-full)",
        }} />
      </div>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

export default function SearchView({ topicId }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    setResults([]);
    setSearched(false);
    setError(null);
  }, [topicId]);

  function runSearch(q) {
    if (!q.trim() || !topicId) return;
    setLoading(true);
    setError(null);
    searchWorks(q, topicId, 12)
      .then((r) => { setResults(r); setSearched(true); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function onInput(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    // Only auto-search once there's enough to embed meaningfully; Enter can still force it.
    if (q.trim().length >= 3) {
      timerRef.current = setTimeout(() => runSearch(q), 500);
    } else if (searched) {
      // Cleared back below the threshold — drop stale results so the now-too-short
      // query doesn't sit above old matches, and let the example chips return.
      setResults([]);
      setSearched(false);
      setError(null);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") { clearTimeout(timerRef.current); runSearch(query); }
  }

  function runExample(q) {
    setQuery(q);
    clearTimeout(timerRef.current);
    runSearch(q);
  }

  const EXAMPLES = [
    "climate adaptation in coastal cities",
    "soil microbiome methods",
    "AI tutoring systems",
  ];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: "var(--sp-5)" }}>
        <input
          type="search"
          className="filter-select"
          aria-label="Search works in this topic"
          style={{ width: "100%", fontSize: "var(--text-sm)", padding: "var(--sp-3) var(--sp-4)" }}
          placeholder="Search by concept, method, or research question…"
          value={query}
          onChange={onInput}
          onKeyDown={onKeyDown}
          autoFocus
        />
        <p style={{ marginTop: "var(--sp-2)", fontSize: "var(--text-xs)", color: "var(--text-3)" }}>
          Semantic search over all works in this topic — ranked by embedding similarity.
        </p>

        {!searched && !query && (
          <div style={{ marginTop: "var(--sp-3)", display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} className="tag" onClick={() => runExample(ex)}>{ex}</button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "var(--sp-8)", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
          Searching…
        </div>
      )}

      {error && (
        <div className="card" style={{ color: "var(--red)" }}>
          {error.includes("503") ? "Embedding model is loading — try again in a few seconds." : error}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="card" style={{ color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
          No matching works found. Try a different phrasing.
        </div>
      )}

      {!loading && results.map((r) => (
        <div key={r.id} className="card" style={{ marginBottom: "var(--sp-3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--sp-3)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "var(--text-sm)",
                fontWeight: "var(--w-semibold)",
                color: "var(--text-1)",
                lineHeight: "var(--leading-snug)",
                marginBottom: "var(--sp-1)",
              }}>
                {r.doi
                  ? <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer"
                      style={{ color: "inherit", textDecoration: "none" }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                      {r.title}
                    </a>
                  : r.title}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", marginBottom: "var(--sp-2)" }}>
                {r.year ?? "—"} · {r.cited_by_count} citations
              </div>
              {r.abstract_snippet && (
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-2)", lineHeight: "var(--leading-relaxed)", margin: 0 }}>
                  {r.abstract_snippet}
                </p>
              )}
            </div>
            <div style={{ flexShrink: 0, width: 100 }}>
              <SimilarityBar value={r.similarity} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
