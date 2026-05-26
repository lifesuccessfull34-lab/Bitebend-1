import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import legacy from "@vitejs/plugin-legacy";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";

// ── Build metadata (resolved once at config load time) ────────────────────────

const commitHash = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
})();

const buildTimestamp = new Date().toISOString();

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

const appBuild = {
  commit: commitHash,
  timestamp: buildTimestamp,
  version: pkg.version,
} as const;

// ── Custom plugin: write build-info.json to dist after build ──────────────────
//
// This file is read by the API server at startup to:
//   1. Confirm the frontend was built before deployment
//   2. Compare frontend vs backend commit hashes (version sync check)
//   3. Expose both via GET /api/admin/build-info
//
// Also used by check-build-freshness.ts to verify the build is up to date.

function buildInfoPlugin() {
  return {
    name: "bitebend-build-info",
    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, "dist/public");
      const buildInfo = { ...appBuild, builtAt: new Date().toISOString() };
      writeFileSync(
        path.join(outDir, "build-info.json"),
        JSON.stringify(buildInfo, null, 2),
      );
      console.log(
        `\n[build-info] commit=${appBuild.commit} ts=${appBuild.timestamp} → dist/public/build-info.json\n`,
      );
    },
  };
}

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;
const basePath = process.env.BASE_PATH ?? "/menu/";

export default defineConfig({
  base: basePath,

  // ── Build-time constants ─────────────────────────────────────────────────
  // __APP_BUILD__ is replaced with a literal object in every output file.
  // Access it anywhere in the source without an import.
  define: {
    __APP_BUILD__: JSON.stringify(appBuild),
  },

  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    buildInfoPlugin(),
    legacy({
      targets: ["Android >= 7", "iOS >= 12", "Samsung >= 8", "Chrome >= 67"],
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },

  root: path.resolve(import.meta.dirname),

  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Generate .vite/manifest.json — maps source paths to hashed output filenames.
    // Used by check-build-freshness.ts to verify the build completed and by
    // the API server to report frontend asset versions.
    manifest: true,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
        pure_funcs: ["console.log", "console.info", "console.debug", "console.warn"],
      },
      mangle: { safari10: true },
      format: { safari10: true },
    },
    chunkSizeWarningLimit: 600,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
          if (id.includes("node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          if (
            id.includes("node_modules/@radix-ui/") ||
            id.includes("node_modules/class-variance-authority/") ||
            id.includes("node_modules/clsx/") ||
            id.includes("node_modules/tailwind-merge/") ||
            id.includes("node_modules/cmdk/") ||
            id.includes("node_modules/vaul/") ||
            id.includes("node_modules/sonner/")
          ) {
            return "vendor-ui";
          }
          if (
            id.includes("node_modules/wouter/") ||
            id.includes("node_modules/@tanstack/") ||
            id.includes("node_modules/zod/")
          ) {
            return "vendor-core";
          }
        },
      },
    },
  },

  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },

  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
