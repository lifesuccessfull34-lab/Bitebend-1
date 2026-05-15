import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import legacy from "@vitejs/plugin-legacy";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

// DEFAULT to /portal/ so the production build always uses the correct base path
// even if BASE_PATH env var is not explicitly set in the build environment.
// Without this, asset paths in the built HTML are /assets/... instead of
// /portal/assets/... — meaning the browser requests them at the root path,
// which is handled by the API server (not the portal static server), causing 404s
// and a permanently blank/loading page on all fresh mobile visits.
const basePath = process.env.BASE_PATH ?? "/portal/";

export default defineConfig({
  base: basePath,
  define: {
    __SITE_URL__: JSON.stringify(process.env.SITE_URL ?? ""),
    __REPLIT_DOMAINS__: JSON.stringify(process.env.REPLIT_DOMAINS ?? ""),
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    // Generate legacy ES5 bundles + polyfills for older Android WebView,
    // Samsung Internet, and in-app browsers that open QR code links.
    // Pass `targets` here (not in build.target) to avoid the
    // "plugin-legacy overrode build.target" warning.
    legacy({
      targets: ["Android >= 7", "iOS >= 12", "Samsung >= 8", "Chrome >= 67"],
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
      // Ensure the legacy plugin doesn't interfere with our manualChunks
      renderLegacyChunks: true,
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
    // Raise the warning threshold — we're splitting manually below,
    // so individual vendor chunks may be large but are cached long-term.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // ── Manual chunk splitting ────────────────────────────────────────
        // Splits the single 1.3 MB bundle into smaller cacheable pieces.
        // Mobile browsers download only what each route needs.
        // After first load, cached chunks are reused across navigations.
        manualChunks(id) {
          // React core — tiny, loaded first, never changes
          if (id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/scheduler/")) {
            return "vendor-react";
          }

          // Charts — only needed on Dashboard/Analytics pages
          if (id.includes("node_modules/recharts") ||
              id.includes("node_modules/d3-") ||
              id.includes("node_modules/victory-")) {
            return "vendor-charts";
          }

          // File upload — only needed on Menu/Profile image upload
          if (id.includes("node_modules/@uppy/") ||
              id.includes("node_modules/preact/")) {
            return "vendor-upload";
          }

          // Spreadsheet export — only needed on Analytics export
          if (id.includes("node_modules/xlsx/")) {
            return "vendor-xlsx";
          }

          // Animation library — used on auth/landing pages
          if (id.includes("node_modules/framer-motion/")) {
            return "vendor-motion";
          }

          // Radix UI + Lucide + shadcn utilities — shared UI components
          // This is the largest chunk but is cached after the first visit
          if (id.includes("node_modules/@radix-ui/") ||
              id.includes("node_modules/lucide-react/") ||
              id.includes("node_modules/class-variance-authority/") ||
              id.includes("node_modules/clsx/") ||
              id.includes("node_modules/tailwind-merge/") ||
              id.includes("node_modules/cmdk/") ||
              id.includes("node_modules/vaul/") ||
              id.includes("node_modules/sonner/") ||
              id.includes("node_modules/embla-carousel")) {
            return "vendor-ui";
          }

          // Routing, query, forms — shared across all pages
          if (id.includes("node_modules/wouter/") ||
              id.includes("node_modules/@tanstack/") ||
              id.includes("node_modules/react-hook-form/") ||
              id.includes("node_modules/@hookform/") ||
              id.includes("node_modules/zod/")) {
            return "vendor-core";
          }

          // QR code — only needed on Dashboard QR display
          if (id.includes("node_modules/qrcode")) {
            return "vendor-qr";
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
