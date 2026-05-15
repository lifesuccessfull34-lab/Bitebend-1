/**
 * Minimal static file server for the portal SPA.
 * Strips the /portal/ base-path prefix before filesystem lookup so assets
 * resolve correctly (proxy sends full paths like /portal/assets/index-HASH.js
 * but files live in dist/public/assets/index-HASH.js).
 *
 * Compression: serves pre-compressed .gz / .br variants when the browser
 * supports them (Accept-Encoding: gzip / br). This cuts JS/CSS transfer
 * sizes by ~70% — critical for mobile users on slow 3G connections.
 */
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const BASE = (process.env.BASE_PATH ?? "/portal/").replace(/\/$/, ""); // e.g. "/portal"
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

/** File types worth compressing (binary formats already compressed) */
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".svg", ".json", ".txt", ".map"]);

function tryStatSync(filePath) {
  try { return statSync(filePath); } catch { return null; }
}

const server = createServer((req, res) => {
  const raw = decodeURIComponent((req.url ?? "/").split("?")[0]);

  // Strip the base path prefix so /portal/assets/x.js → /assets/x.js
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
  const canCompress = COMPRESSIBLE.has(ext);

  const acceptEncoding = req.headers["accept-encoding"] ?? "";
  const wantsGzip = canCompress && acceptEncoding.includes("gzip");

  const baseHeaders = {
    "Content-Type":           MIME[ext] ?? "application/octet-stream",
    "Cache-Control":          isFingerprinted
                                ? "public, max-age=31536000, immutable"
                                : "no-store, no-cache, must-revalidate",
    "Pragma":                 "no-cache",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
    // Allows the page to be loaded inside mobile in-app browsers
    "X-Frame-Options":        "SAMEORIGIN",
  };

  if (req.method === "HEAD") {
    res.writeHead(200, { ...baseHeaders, "Content-Length": stat.size });
    res.end();
    return;
  }

  if (wantsGzip) {
    // Stream with on-the-fly gzip — no pre-built .gz files needed
    res.writeHead(200, {
      ...baseHeaders,
      "Content-Encoding": "gzip",
      "Vary": "Accept-Encoding",
      // No Content-Length — gzip output size is unknown ahead of time
    });
    const stream = createReadStream(filePath);
    const gz = createGzip({ level: 6 });
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    });
    gz.on("error", () => {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    });
    stream.pipe(gz).pipe(res);
  } else {
    res.writeHead(200, { ...baseHeaders, "Content-Length": stat.size });
    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    });
    stream.pipe(res);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Portal static server on port ${PORT}, base=${BASE}, root=${ROOT}`);
});
