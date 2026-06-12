import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import legacy from "@vitejs/plugin-legacy";

const port = process.env.PORT ? Number(process.env.PORT) : 5173;

/**
 * IMPORTANT:
 * Netlify MUST NOT use /portal base path
 */
const basePath = "/";

export default defineConfig({
  base: basePath,
  
  define: {
    __SITE_URL__: JSON.stringify(process.env.VITE_SITE_URL || ""),
    __REPLIT_DOMAINS__: JSON.stringify(""),
  },

  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),

    legacy({
      targets: ["Android >= 7", "iOS >= 12", "Chrome >= 67"],
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
      renderLegacyChunks: true,
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },

  root: path.resolve(import.meta.dirname),

  build: {
    /**
     * CRITICAL FIX:
     * Netlify expects dist/index.html (NOT dist/public)
     */
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },

  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },

  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
