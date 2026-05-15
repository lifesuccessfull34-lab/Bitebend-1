#!/usr/bin/env tsx
/**
 * check-render-safety.ts
 *
 * Scans React component files (.tsx) for the navigate-in-render antipattern:
 * calling navigate() directly in a component render body instead of inside
 * useEffect / useCallback / useMemo / an event handler.
 *
 * WHY THIS MATTERS — React error #310 "Maximum update depth exceeded":
 *   Calling navigate() (or any state-setter) during a component's render body
 *   triggers a re-render, which calls navigate() again — infinite loop.
 *   This crashes all React apps but is especially visible on mobile browsers
 *   (Google Lens, Samsung Internet, Android WebView) that use minified builds.
 *
 *   ❌ WRONG — navigate() called during render:
 *     function Redirector() {
 *       const [loc, navigate] = useLocation();
 *       if (loc.endsWith("/")) navigate(loc.slice(0, -1));  // ← triggers loop!
 *       return null;
 *     }
 *
 *   ✅ CORRECT — use useEffect or explicit route variants:
 *     useEffect(() => {
 *       if (loc.endsWith("/")) navigate(loc.slice(0, -1));
 *     }, [loc]);
 *
 *   Or better: add trailing-slash route variants in the Switch (no navigation needed).
 *
 * HEURISTIC:
 *   For each navigate() call found in a .tsx file, this script checks whether
 *   any of the 20 preceding lines contain a hook/handler wrapper keyword.
 *   Calls with no nearby wrapper are flagged as suspicious.
 *
 *   This is intentionally conservative — it will miss some cases and may flag
 *   some false positives. For definitive analysis, use the ESLint
 *   react-hooks/rules-of-hooks plugin. This script is a fast first-pass gate.
 *
 * USAGE:
 *   pnpm run check:render-safety
 *   pnpm --filter @workspace/scripts run check:render-safety
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Configuration ─────────────────────────────────────────────────────────────

// Resolve paths relative to the workspace root (one level above this package).
const __filename = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = join(dirname(__filename), "..", "..");

const SCAN_DIRS = [
  join(WORKSPACE_ROOT, "artifacts/menu/src"),
  join(WORKSPACE_ROOT, "artifacts/portal/src"),
];

/**
 * Keywords that indicate navigate() is safely inside a hook or handler.
 * If any of these appear within CONTEXT_LINES lines before the navigate() call,
 * the call is considered safe.
 */
const SAFE_WRAPPERS = [
  // React hooks
  "useEffect",
  "useCallback",
  "useMemo",
  "useLayoutEffect",
  // Event handler attributes (JSX)
  "onClick",
  "onChange",
  "onSubmit",
  "onPress",
  "onBlur",
  "onFocus",
  "onKeyDown",
  "onKeyUp",
  "addEventListener",
  // Named handler function patterns (const handleXxx = ..., function handleXxx)
  "const handle",
  "function handle",
  "handleClick",
  "handleSubmit",
  "handleChange",
  // Async functions / try-catch (navigation after await is safe — inside an async handler)
  "async (",
  "async (e",
  "=> {",
  "try {",
  // Timer callbacks (setTimeout / setInterval — always async, never in render)
  "setTimeout",
  "setInterval",
];

/**
 * Patterns that identify a navigate() call site.
 * Matches: navigate(, router.push(, useNavigate, push(, replace(
 */
const NAVIGATE_PATTERN = /\bnavigate\s*\(/;

const CONTEXT_LINES = 20;

// ── File walker ───────────────────────────────────────────────────────────────

function walkTsx(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push(...walkTsx(full));
      } else if (extname(full) === ".tsx" || extname(full) === ".ts") {
        results.push(full);
      }
    } catch {
      // skip unreadable entries
    }
  }
  return results;
}

// ── Analyser ──────────────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  text: string;
  reason: string;
}

function analyseFile(filePath: string): Violation[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip blank lines, comment lines, and import statements
    if (!NAVIGATE_PATTERN.test(line)) continue;
    if (/^\s*(\/\/|\/\*|\*|import\s)/.test(line)) continue;
    // Skip lines that are themselves defining a wrapper (e.g. const handleNav = () => navigate(...))
    if (/^\s*(const|let|var|function)\s+\w+/.test(line)) continue;

    // Look at the preceding CONTEXT_LINES lines for a safe wrapper
    const contextStart = Math.max(0, i - CONTEXT_LINES);
    const contextLines = lines.slice(contextStart, i + 1);
    const context = contextLines.join("\n");

    const hasSafeWrapper = SAFE_WRAPPERS.some((w) => context.includes(w));

    if (!hasSafeWrapper) {
      violations.push({
        file: relative(process.cwd(), filePath),
        line: i + 1,
        text: line.trim(),
        reason: `navigate() called with no hook/handler wrapper in the preceding ${CONTEXT_LINES} lines`,
      });
    }
  }

  return violations;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const files = SCAN_DIRS.flatMap(walkTsx);
const allViolations: Violation[] = files.flatMap(analyseFile);

if (allViolations.length === 0) {
  console.log("✓ check:render-safety — no navigate-in-render violations found.");
  console.log(`  Scanned ${files.length} file(s) in: ${SCAN_DIRS.join(", ")}`);
  process.exit(0);
} else {
  console.error(`\n⚠️  check:render-safety — ${allViolations.length} potential violation(s) found:\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.reason}`);
    console.error();
  }
  console.error("Fix: move navigate() calls inside useEffect(() => { ... }, [deps])");
  console.error("     OR use explicit trailing-slash route variants in the Switch.");
  console.error("     See artifacts/menu/src/App.tsx for a correct example.\n");
  process.exit(1);
}
