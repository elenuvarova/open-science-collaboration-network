import { useEffect, useState } from "react";
import { getMeta } from "../api";

// One request per page load, shared by every stamp on screen.
let metaPromise;
export function loadMeta() {
  metaPromise ??= getMeta().catch(() => null);
  return metaPromise;
}

export function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// "Data as of 28 Sep 2026 · Methodology" — the claim every score depends on.
export default function DataStamp({ topicId }) {
  const [meta, setMeta] = useState(null);
  useEffect(() => { loadMeta().then(setMeta); }, []);
  const date = formatDate(meta?.data_as_of);
  return (
    <span className="data-stamp">
      {date ? `Data as of ${date}` : "Open data, refreshed weekly"}
      {" · "}
      <a href={`#/method/${topicId ?? ""}`}>How scores are made</a>
    </span>
  );
}
