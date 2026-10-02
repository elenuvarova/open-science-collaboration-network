import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import "./styles.css";

// A deploy swaps the hashed chunks; a tab opened before it then fails to load a
// lazy chunk (404). Reload once to pick up the new build instead of a blank page.
window.addEventListener("vite:preloadError", () => {
  try {
    if (sessionStorage.getItem("chunk_reloaded")) return;
    sessionStorage.setItem("chunk_reloaded", "1");
  } catch { /* storage blocked: still reload once per page load */ }
  // No preventDefault: suppressing the error would hand React.lazy an undefined
  // module and crash before the reload lands.
  window.location.reload();
});
window.addEventListener("load", () => {
  setTimeout(() => { try { sessionStorage.removeItem("chunk_reloaded"); } catch { /* ignore */ } }, 10000);
});

// "/" is the landing page; the tool lives under "/app" (hash routes inside).
// Old shared links looked like "/#/shortlist/1/445" — forward them to "/app".
const { pathname, hash } = window.location;
if (!pathname.startsWith("/app") && hash.startsWith("#/")) {
  window.location.replace(`/app${hash}`);
}

// Code-split: the landing never pays for Cytoscape, the app never for the landing art.
const App = lazy(() => import("./App.jsx"));
const Landing = lazy(() => import("./pages/Landing.jsx"));
const isApp = pathname.startsWith("/app");

const rootEl = document.getElementById("root");
if (!isApp && rootEl.hasChildNodes()) {
  // Landing was prerendered at build time — hydrate it in place, no blank flash.
  import("./pages/Landing.jsx").then(({ default: L }) => hydrateRoot(rootEl, <L />));
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <Suspense fallback={null}>{isApp ? <App /> : <Landing />}</Suspense>
    </React.StrictMode>
  );
}
