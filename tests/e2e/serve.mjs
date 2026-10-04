// Minimal static server for e2e tests. It serves dist/ the way the
// Cloudflare assets binding does for this site (build.format "file",
// trailingSlash "never"): "/phones/tools" -> "phones/tools.html".
// `astro preview` is not used because it detaches into the background in
// non-interactive shells, which Playwright's webServer cannot manage.

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../dist/", import.meta.url));
const port = Number(process.env.PORT ?? 4321);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function resolveFile(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates =
    clean === "/" || clean === ""
      ? ["index.html"]
      : [clean, `${clean}.html`, join(clean, "index.html")];
  for (const candidate of candidates) {
    const file = join(root, candidate);
    if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) {
      return file;
    }
  }
  return null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  const file = resolveFile(pathname);
  const status = file ? 200 : 404;
  const target = file ?? join(root, "404.html");
  res.writeHead(status, {
    "Content-Type": TYPES[extname(target)] ?? "application/octet-stream",
  });
  createReadStream(target).pipe(res);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Serving dist/ at http://127.0.0.1:${port}\n`);
});
