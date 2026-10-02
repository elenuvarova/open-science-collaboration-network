// Build-time prerender of the landing page (see scripts/prerender.mjs).
// Runs in Node with no window/document — Landing only touches them in effects.
import { renderToString } from "react-dom/server";
import Landing from "./pages/Landing.jsx";

export function render() {
  return renderToString(<Landing />);
}
