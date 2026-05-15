/**
 * check-build-freshness.ts
 *
 * Pre-deployment safety check that prevents stale frontend bundles from being
 * published. Run with:
 *
 *   pnpm run check:freshness
 *
 * Exit 0  → build is fresh and safe to deploy
 * Exit 1  → stale or missing build — run `pnpm --filter @workspace/menu run build`
 *
 * Checks performed:
 *  1. dist/public/         exists
 *  2. dist/public/build-info.json   exists (written by buildInfoPlugin)
 *  3. dist/public/.vite/manifest.json  exists (from build.manifest: true)
 *  4. dist/public/assets/ has at least one file
 *  5. All .js and .css assets have content-hashed filenames
 *  6. Newest src/ file is OLDER than the oldest dist/assets/ file
 *     (dist is at least as new as the source)
 */

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const MENU_SRC = join(WORKSPACE_ROOT, "artifacts", "menu", "src");
const MENU_DIST = join(WORKSPACE_ROOT, "artifacts", "menu", "dist", "public");
const ASSETS_DIR = join(MENU_DIST, "assets");
const BUILD_INFO = join(MENU_DIST, "build-info.json");
const MANIFEST = join(MENU_DIST, ".vite", "manifest.json");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function walkMtimes(dir: string, exts?: Set<string>): number[] {
  const mtimes: number[] = [];
  function walk(d: string) {
    let names: string[];
    try {
      names = readdirSync(d) as string[];
    } catch {
      return;
    }
    for (const name of names) {
      if (name === "node_modules" || name === ".git") continue;
      const full = join(d, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile()) {
        if (exts && !exts.has(extname(name))) continue;
        mtimes.push(st.mtimeMs);
      }
    }
  }
  walk(dir);
  return mtimes;
}

function fail(msg: string): never {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`✓  ${msg}`);
}

function warn(msg: string) {
  console.warn(`⚠  ${msg}`);
}

// ─── Checks ───────────────────────────────────────────────────────────────────

console.log("\n── Deployment freshness check ──────────────────────────────────────\n");

// 1. dist/public exists
if (!existsSync(MENU_DIST)) {
  fail(
    `Frontend dist not found at artifacts/menu/dist/public/\n   Run: pnpm --filter @workspace/menu run build`,
  );
}
ok("dist/public/ exists");

// 2. build-info.json exists
if (!existsSync(BUILD_INFO)) {
  fail(
    `dist/public/build-info.json missing — Vite buildInfoPlugin did not run.\n   Run: pnpm --filter @workspace/menu run build`,
  );
}
const buildInfo = JSON.parse(readFileSync(BUILD_INFO, "utf-8")) as {
  commit: string;
  timestamp: string;
  version: string;
  builtAt: string;
};
ok(`build-info.json → commit=${buildInfo.commit} ts=${buildInfo.timestamp}`);

// 3. Vite manifest exists
if (!existsSync(MANIFEST)) {
  fail(
    `dist/public/.vite/manifest.json missing — Vite manifest was not generated.\n   Ensure build.manifest: true in vite.config.ts then: pnpm --filter @workspace/menu run build`,
  );
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as Record<string, unknown>;
ok(`manifest.json exists (${Object.keys(manifest).length} entries)`);

// 4. assets/ has files
if (!existsSync(ASSETS_DIR)) {
  fail(`dist/public/assets/ directory is missing. Re-run the build.`);
}
let assetFiles: string[] = [];
try {
  assetFiles = readdirSync(ASSETS_DIR).filter(
    (f) => extname(f) === ".js" || extname(f) === ".css",
  );
} catch {
  fail("Could not read dist/public/assets/. Re-run the build.");
}
if (assetFiles.length === 0) {
  fail("dist/public/assets/ has no .js or .css files. Re-run the build.");
}
ok(`assets/ has ${assetFiles.length} JS/CSS file(s)`);

// 5. All JS/CSS assets have content-hashed filenames
// Vite names files like: index-BqWz3kLm.js using base64url hashes.
// Base64url includes A-Z, a-z, 0-9, -, _ so a Vite hash like "6T2kOG-o"
// or "CtOo4_-Q" is valid. Minimum 6 chars to avoid false-positive short words.
const HASH_RE = /-[A-Za-z0-9_-]{6,}\.(js|css)$/;
const unhashed = assetFiles.filter((f) => !HASH_RE.test(f));
if (unhashed.length > 0) {
  fail(
    `Found assets without content-hash in filename:\n   ${unhashed.map((f) => basename(f)).join("\n   ")}\n   This means cache-busting is not working. Re-run the build.`,
  );
}
ok(`All ${assetFiles.length} assets have content-hashed filenames`);

// 6. dist is newer than src (no stale build)
const srcMtimes = walkMtimes(MENU_SRC, new Set([".ts", ".tsx", ".css", ".html", ".json"]));
const distMtimes = walkMtimes(ASSETS_DIR);

if (srcMtimes.length === 0 || distMtimes.length === 0) {
  warn("Could not compare src/dist timestamps — skipping staleness check.");
} else {
  const newestSrc = Math.max(...srcMtimes);
  const oldestDist = Math.min(...distMtimes);

  const diffMs = oldestDist - newestSrc;
  const diffSec = Math.round(diffMs / 1000);

  if (diffMs < 0) {
    const staleSec = Math.abs(diffSec);
    fail(
      `Stale build detected: dist assets are ${staleSec}s older than source files.\n   Run: pnpm --filter @workspace/menu run build`,
    );
  }

  ok(`dist is ${diffSec >= 0 ? `${diffSec}s newer than` : "up to date with"} src`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`
────────────────────────────────────────────────────────────────
✅  Build is fresh and safe to deploy.

   commit  : ${buildInfo.commit}
   built   : ${buildInfo.builtAt}
   version : ${buildInfo.version}
────────────────────────────────────────────────────────────────
`);
