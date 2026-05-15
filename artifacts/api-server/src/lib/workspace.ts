/**
 * Resolves the monorepo workspace root from the location of the running bundle.
 *
 * The compiled bundle lives at:
 *   artifacts/api-server/dist/index.mjs
 *
 * URL resolution strips the filename first, then applies the relative path:
 *   base dir = .../artifacts/api-server/dist/
 *   ../       → .../artifacts/api-server/
 *   ../../    → .../artifacts/
 *   ../../../  → <workspace root>   ← 3 levels from dist/
 *
 * Using import.meta.url (not process.cwd()) ensures this works regardless of
 * which directory the node process was started from.
 */
import { fileURLToPath } from "node:url";

export const WORKSPACE_ROOT = fileURLToPath(
  new URL("../../..", import.meta.url),
);
