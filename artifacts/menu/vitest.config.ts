import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Vitest configuration for @workspace/menu
// Uses happy-dom for a lightweight DOM environment.
// The @/ alias must match the one declared in vite.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: false,
    setupFiles: ["./src/__tests__/setup.ts"],
    // Exclude Vite build files
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    // Deduplicate React so test and component share the same instance
    dedupe: ["react", "react-dom"],
  },
  // Suppress the __APP_BUILD__ global that Vite's `define` injects at build
  // time but is undefined during vitest runs.
  define: {
    __APP_BUILD__: JSON.stringify({
      commit: "test",
      timestamp: "1970-01-01T00:00:00.000Z",
      version: "0.0.0",
    }),
  },
});
