// After `vite build` + the SSR build of src/entry-server.jsx:
//   dist/app.html   — the plain SPA shell, served for /app (no landing markup flash)
//   dist/index.html — the same shell with the landing HTML baked into #root,
//                     so crawlers and link previews see real text.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shell = readFileSync(resolve(root, "dist/index.html"), "utf8");
const { render } = await import(pathToFileURL(resolve(root, "dist-ssr/entry-server.js")).href);
const html = render();
if (!shell.includes('<div id="root"></div>')) throw new Error("root placeholder not found in dist/index.html");

writeFileSync(resolve(root, "dist/app.html"), shell);
writeFileSync(resolve(root, "dist/index.html"), shell.replace('<div id="root"></div>', `<div id="root">${html}</div>`));
rmSync(resolve(root, "dist-ssr"), { recursive: true, force: true });
console.log(`prerendered landing: ${html.length} chars`);
