#!/usr/bin/env tsx
/**
 * check-css-bundle.ts
 *
 * Verifies the production CSS bundle for @workspace/menu contains all critical
 * Tailwind utility classes used by the Menu UI. Run with:
 *
 *   pnpm run check:css-bundle
 *
 * Exit 0  → all critical classes are present; bundle is safe to deploy
 * Exit 1  → one or more classes are missing — Tailwind did not scan all source files
 *
 * WHY THIS EXISTS
 * ───────────────
 * Tailwind v4 has two scanning modes:
 *
 *   Dev   (vite dev)   – uses Vite's module graph; every imported file is
 *                        automatically scanned → layout is always correct in dev.
 *
 *   Prod  (vite build) – uses a file-system scan; if a new subdirectory is
 *                        added (e.g. src/pages/menu/) and no explicit @source
 *                        directive covers it, the scan can miss those files.
 *                        Classes used ONLY in the new files are then absent from
 *                        the CSS bundle and the layout breaks in production only.
 *
 * This check detects that regression before the bundle reaches users.
 * The @source "./**\/*.{ts,tsx}" directive in src/index.css is the permanent
 * fix; this script is the automated guard that confirms it keeps working.
 *
 * CLASSES CHECKED
 * ───────────────
 * These are the flex / layout / sizing utilities that were at the centre of the
 * May 2026 mobile layout regression (images rendering full-width below content,
 * missing header padding, broken search-bar pill shape):
 *
 *   flex            card container display:flex          (MenuItemCard)
 *   flex-1          content area flex:1                  (MenuItemCard content div)
 *   min-w-0         prevents flex-child overflow         (MenuItemCard content div)
 *   shrink-0        image flex-shrink:0                  (MenuItemCard <img>)
 *   overflow-hidden card overflow clip for rounded corners
 *   sticky          search bar stays pinned              (CategoryTabs)
 *   px-5            menu header horizontal padding       (MenuHeader)
 *   object-cover    image object-fit:cover               (MenuItemCard <img>)
 *   rounded-*       any rounded variant (2xl, full, lg…) used throughout
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const ASSETS_DIR = join(
  WORKSPACE_ROOT,
  "artifacts",
  "menu",
  "dist",
  "public",
  "assets",
);

// ─── Critical classes ─────────────────────────────────────────────────────────
//
// Each entry has:
//   cls   – human-readable class name (for error messages)
//   re    – regex that matches the class selector in minified or pretty CSS.
//           The negative lookahead (?![a-zA-Z0-9_-]) ensures we match the exact
//           class and not a longer class that shares the same prefix (e.g. we
//           want ".flex" but NOT ".flex-1" or ".flex-col").
//   desc  – why this class matters (helps diagnose regressions)

const CHECKS: { cls: string; re: RegExp; desc: string }[] = [
  {
    cls: "flex",
    re: /\.flex(?![a-zA-Z0-9_-])/,
    desc: "card container display:flex — MenuItemCard outer div",
  },
  {
    cls: "flex-1",
    re: /\.flex-1(?![a-zA-Z0-9_-])/,
    desc: "content area flex:1 — MenuItemCard content div (prevents card collapse)",
  },
  {
    cls: "min-w-0",
    re: /\.min-w-0(?![a-zA-Z0-9_-])/,
    desc: "content min-width:0 — prevents flex child text overflow",
  },
  {
    cls: "shrink-0",
    re: /\.shrink-0(?![a-zA-Z0-9_-])/,
    desc: "flex-shrink:0 — MenuItemCard image + colour stripe (must not compress)",
  },
  {
    cls: "overflow-hidden",
    re: /\.overflow-hidden(?![a-zA-Z0-9_-])/,
    desc: "overflow:hidden — clips card contents to rounded-2xl border-radius",
  },
  {
    cls: "sticky",
    re: /\.sticky(?![a-zA-Z0-9_-])/,
    desc: "position:sticky — CategoryTabs search/filter bar stays pinned at top",
  },
  {
    cls: "px-5",
    re: /\.px-5(?![a-zA-Z0-9_-])/,
    desc: "horizontal padding — MenuHeader restaurant name area",
  },
  {
    cls: "object-cover",
    re: /\.object-cover(?![a-zA-Z0-9_-])/,
    desc: "object-fit:cover — MenuItemCard dish image sizing",
  },
  {
    cls: "rounded-* (any variant)",
    re: /\.rounded-[a-z0-9]/,
    desc: "border-radius — rounded-2xl on cards, rounded-full on search / tabs",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fail(msg: string): never {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`✓  ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(
  "\n── CSS bundle integrity check ──────────────────────────────────────\n",
);

// 1. assets/ directory must exist (implies a build was run)
if (!existsSync(ASSETS_DIR)) {
  fail(
    `assets/ directory not found at artifacts/menu/dist/public/assets/\n` +
      `   Run the build first: pnpm --filter @workspace/menu run build`,
  );
}

// 2. Find all CSS files in the assets directory
let cssFiles: string[];
try {
  cssFiles = readdirSync(ASSETS_DIR).filter((f) => extname(f) === ".css");
} catch {
  fail(`Could not read assets directory. Re-run the build.`);
}

if (cssFiles.length === 0) {
  fail(
    `No .css files found in dist/public/assets/\n` +
      `   Run the build first: pnpm --filter @workspace/menu run build`,
  );
}

ok(`Found ${cssFiles.length} CSS file(s): ${cssFiles.join(", ")}`);

// 3. Concatenate all CSS content for scanning
const css = cssFiles
  .map((f) => readFileSync(join(ASSETS_DIR, f), "utf-8"))
  .join("\n");

const sizeKb = (css.length / 1024).toFixed(1);
console.log(`   Total CSS size: ${sizeKb} KB\n`);

// 4. Check each critical class
const missing: string[] = [];

for (const { cls, re, desc } of CHECKS) {
  if (re.test(css)) {
    ok(`${cls.padEnd(28)} ${desc}`);
  } else {
    console.error(`✗  ${cls.padEnd(28)} MISSING — ${desc}`);
    missing.push(cls);
  }
}

// 5. Report result
console.log("");

if (missing.length > 0) {
  fail(
    `CSS bundle is missing ${missing.length} critical utility class${missing.length > 1 ? "es" : ""}:\n\n` +
      `   ${missing.join(", ")}\n\n` +
      `   This typically means Tailwind v4's production file-system scan did\n` +
      `   not cover all source files after a component refactor.\n\n` +
      `   Fix: ensure artifacts/menu/src/index.css contains:\n` +
      `     @source "./**/*.{ts,tsx}";`,
  );
}

console.log(`\
────────────────────────────────────────────────────────────────
✅  CSS bundle verified — all ${CHECKS.length} critical utility classes present.

    Mobile layout regression protection active.
    (Tailwind v4 production scan is covering all Menu UI subcomponents.)
────────────────────────────────────────────────────────────────
`);
