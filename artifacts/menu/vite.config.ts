import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import legacy from "@vitejs/plugin-legacy";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";

// ── Build metadata ─────────────────────────────────────────────────────────────

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

// ── Build info plugin (UNCHANGED) ─────────────────────────────────────────────

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

// ── NEW: Netlify redirects auto-inject plugin (FIX) ──────────────────────────

function netlifyRedirectsPlugin() {
  return {
    name: "netlify-redirects-auto-copy",
    closeBundle() {
      const src = path.resolve(import.meta.dirname, "public/_redirects");
      const destDir = path.resolve(import.meta.dirname, "dist/public");
      const dest = path.join(destDir, "_redirects");

      try {
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }

        if (existsSync(src)) {
          copyFileSync(src, dest);
          console.log("\n[_redirects] copied to dist/public successfully\n");
        } else {
          console.warn("\n[_redirects] source file not found in public/\n");
        }
      } catch (err) {
        console.error("[_redirects] copy failed:", err);
      }
    },
  };
}

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",

  define: {
    __APP_BUILD__: JSON.stringify(appBuild),
  },

  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    buildInfoPlugin(),

    // ✅ ADDED FIX (SAFE, NON-BREAKING)
    netlifyRedirectsPlugin(),

    legacy({
      targets: ["Android >= 7", "iOS >= 12", "Samsung >= 8", "Chrome >= 67"],
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },

  root: path.resolve(import.meta.dirname),

  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,

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