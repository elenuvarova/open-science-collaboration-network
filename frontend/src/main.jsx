import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={null}>{isApp ? <App /> : <Landing />}</Suspense>
  </React.StrictMode>
);
