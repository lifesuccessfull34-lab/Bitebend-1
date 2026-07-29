import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for @workspace/api-server.
 *
 * Tests in this package are pure unit tests (no DB, no Express) and run in a
 * Node.js environment.  DATABASE_URL and other env vars are NOT required.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
