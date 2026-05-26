/**
 * check-http-links.ts
 *
 * Scans all TypeScript / TSX / JS / HTML / TOML source files under artifacts/
 * and lib/ for any occurrence of "http://bitebend.in". This pattern must never
 * appear in production source: all generated links must use https://.
 *
 * Exits 1 (failing the deploy gate) if any match is found.
 * Exits 0 if the codebase is clean.
 *
 * Usage:  tsx ./src/check-http-links.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WORKSPACE_ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");

const SEARCH_DIRS = ["artifacts", "lib"].map((d) => join(WORKSPACE_ROOT, d));
const SEARCH_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".html", ".toml"]);
const EXCLUDE_DIRS = new Set(["node_modules", "dist", ".git", ".local"]);

/** Pattern that must never appear in production sources */
const FORBIDDEN = "http://bitebend.in";

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (SEARCH_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      yield full;
    }
  }
}

let violations = 0;

for (const searchDir of SEARCH_DIRS) {
  try {
    statSync(searchDir);
  } catch {
    continue; // dir doesn't exist — skip
  }

  for (const file of walk(searchDir)) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(FORBIDDEN)) {
        const rel = relative(WORKSPACE_ROOT, file);
        console.error(`✗ ${rel}:${i + 1}: contains "${FORBIDDEN}"`);
        console.error(`    ${lines[i].trim()}`);
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n[check:no-http-links] FAILED — ${violations} violation(s) found.`);
  console.error(`All production links must use https://bitebend.in (not http://).\n`);
  process.exit(1);
} else {
  console.log(`[check:no-http-links] ✓ No plain-HTTP bitebend.in links found in source.`);
  process.exit(0);
}
