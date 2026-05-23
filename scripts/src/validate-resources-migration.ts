/**
 * validate-resources-migration.ts
 *
 * Audits the entire codebase for any remaining references to the old
 * localStorage / mock-data Resources architecture. Exits non-zero if any
 * disallowed patterns are found.
 *
 * Usage: pnpm --filter @workspace/scripts run validate:resources-migration
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "../../");

// ── Patterns that must NOT exist anywhere outside resourceService.ts ─────────

const BANNED: { pattern: RegExp; label: string }[] = [
  { pattern: /MOCK_RESOURCES/,                label: "MOCK_RESOURCES (hardcoded mock data)"      },
  { pattern: /bb:resources_custom/,           label: "bb:resources_custom (custom localStorage)" },
  { pattern: /bb:resources_updates/,          label: "bb:resources_updates (localStorage edits)" },
  { pattern: /LS_CUSTOM\b/,                   label: "LS_CUSTOM (custom localStorage key)"       },
  { pattern: /getResources\s*\(/,             label: "getResources() (old mock API)"             },
  { pattern: /createResource\s*\(/,           label: "createResource() (old mock write)"         },
  { pattern: /updateResource\s*\(/,           label: "updateResource() (old mock write)"         },
  { pattern: /deleteResource\s*\(/,           label: "deleteResource() (old mock write)"         },
  { pattern: /reorderResources\s*\(/,         label: "reorderResources() (old mock write)"       },
  // Flag value imports from /data/resources but NOT "import type" (types are fine).
  { pattern: /^import\s+(?!type[\s{]).*from\s+['"].*\/data\/resources['"]/,
                                              label: "import from /data/resources (stale data)"   },
];

// Files allowed to mention these patterns (e.g. resourceService.ts itself for
// backward-compat comments, or this script's source).
const ALLOW_LIST = new Set([
  "artifacts/portal/src/services/resourceService.ts",
  "scripts/src/validate-resources-migration.ts",
]);

// ── Walk the source tree ──────────────────────────────────────────────────────

const SOURCE_DIRS = ["artifacts", "lib", "scripts/src"];
const EXTENSIONS  = new Set([".ts", ".tsx", ".js", ".jsx"]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      yield* walk(full);
    } else if (entry.isFile() && EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      yield full;
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

let violations = 0;
const findings: string[] = [];

for (const absDir of SOURCE_DIRS) {
  const dir = join(ROOT, absDir);
  try { statSync(dir); } catch { continue; }

  for (const absFile of walk(dir)) {
    const relFile = relative(ROOT, absFile);
    if (ALLOW_LIST.has(relFile)) continue;

    const content = readFileSync(absFile, "utf-8");
    const lines = content.split("\n");

    for (const { pattern, label } of BANNED) {
      lines.forEach((line, i) => {
        if (pattern.test(line)) {
          violations++;
          findings.push(`  ${relFile}:${i + 1} — ${label}`);
          findings.push(`    ${line.trim()}`);
        }
      });
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log("=== Resources Migration Audit ===\n");

if (violations === 0) {
  console.log("✅  PASS — No mock/localStorage resource references found outside allowed files.");
  console.log("    The Resources system is fully backend-driven.");
} else {
  console.error(`❌  FAIL — Found ${violations} disallowed reference(s):\n`);
  for (const line of findings) console.error(line);
  console.error("\nRemove these references and rerun the audit.");
  process.exit(1);
}

// ── Also confirm resourceService.ts no longer exports old CRUD functions ──────

const svcPath = join(ROOT, "artifacts/portal/src/services/resourceService.ts");
try {
  const svc = readFileSync(svcPath, "utf-8");
  const oldExports = ["export function getResources", "export function createResource",
                      "export function updateResource", "export function deleteResource",
                      "export function reorderResources"];
  const found = oldExports.filter((e) => svc.includes(e));
  if (found.length > 0) {
    console.error("\n❌  resourceService.ts still exports old CRUD functions:");
    found.forEach((f) => console.error(`    ${f}`));
    process.exit(1);
  } else {
    console.log("\n✅  resourceService.ts: old CRUD exports removed — confirmed.");
  }
} catch (e) {
  console.warn("⚠️   Could not read resourceService.ts:", (e as Error).message);
}
