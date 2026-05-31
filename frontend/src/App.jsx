import { useState, useEffect } from "react";

function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [url]);

  return { data, loading, error };
}

export default function App() {
  const hello = useFetch("/api/hello");
  const health = useFetch("/api/health");

  return (
    <main>
      <h1>Full-Stack Template</h1>

      <section>
        <h2>/api/hello</h2>
        {hello.loading && <p className="muted">Loading…</p>}
        {hello.error && <p className="error">Error: {hello.error.message}</p>}
        {hello.data && <p className="result">{hello.data.message}</p>}
      </section>

      <section>
        <h2>/api/health</h2>
        {health.loading && <p className="muted">Loading…</p>}
        {health.error && <p className="error">Error: {health.error.message}</p>}
        {health.data && (
          <p className="result">
            status: {health.data.status} &nbsp;|&nbsp; db: {health.data.db}
          </p>
        )}
      </section>
    </main>
  );
}
