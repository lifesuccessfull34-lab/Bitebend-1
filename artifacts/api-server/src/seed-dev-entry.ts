/**
 * seed-dev-entry.ts
 * Entry-point wrapper for the dev seed. Built by esbuild as dist/seed-dev.mjs.
 * Keeping the runner here (not in seed-dev.ts) ensures the library can be
 * imported by reset-db.ts and index.ts without triggering a double-execution.
 */
import { seedDev } from "./seed-dev";

seedDev()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-dev] failed:", err);
    process.exit(1);
  });
