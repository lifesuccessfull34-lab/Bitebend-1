/**
 * Minimal static file server for the menu SPA.
 * Strips the /menu/ base-path prefix before filesystem lookup so assets
 * resolve correctly (proxy sends full paths like /menu/assets/index-HASH.js
 * but files live in dist/public/assets/index-HASH.js).
 */
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const BASE = (process.env.BASE_PATH ?? "/menu/").replace(/\/$/, ""); // e.g. "/menu"
const ROOT = join(__dirname, "dist/public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".otf":  "font/otf",
  ".txt":  "text/plain; charset=utf-8",
  ".map":  "application/json",
};

function tryStatSync(filePath) {
  try { return statSync(filePath); } catch { return null; }
}

const server = createServer((req, res) => {
  const raw = decodeURIComponent((req.url ?? "/").split("?")[0]);

  // Strip the base path prefix so /menu/assets/x.js → /assets/x.js
  const pathname = raw.startsWith(BASE) ? raw.slice(BASE.length) || "/" : raw;

  let filePath = join(ROOT, pathname);
  let stat = tryStatSync(filePath);

  // SPA fallback: unknown paths → index.html
  if (!stat || stat.isDirectory()) {
    filePath = join(ROOT, "index.html");
    stat = tryStatSync(filePath);
  }

  if (!stat) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const isFingerprinted = pathname.startsWith("/assets/");

  const headers = {
    "Content-Type":           MIME[ext] ?? "application/octet-stream",
    "Cache-Control":          isFingerprinted
                                ? "public, max-age=31536000, immutable"
                                : "no-store, no-cache, must-revalidate",
    "Pragma":                 "no-cache",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
    // Required for Google Lens, WhatsApp, Instagram in-app browsers
    // to render the page without blocking it as a frame.
    "X-Frame-Options":        "SAMEORIGIN",
    "Content-Length":         stat.size,
  };

  res.writeHead(200, headers);
  if (req.method === "HEAD") { res.end(); return; }

  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  });
  stream.pipe(res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Menu static server on port ${PORT}, base=${BASE}, root=${ROOT}`);
});
