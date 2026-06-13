import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import legacy from "@vitejs/plugin-legacy";

// The Replit artifact system expects web artifacts on port 5000.
// If PORT is explicitly overridden (e.g. local dev outside artifact system), use that.
const port = process.env.PORT ? Number(process.env.PORT) : 5000;

const basePath = process.env.BASE_PATH ?? "/";

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
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },

  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      // In development, the API server runs as a separate artifact on port 8080.
      // Proxy all /api calls there so the portal can reach the backend.
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // Proxy WebSocket + HTTP for the WhatsApp Bridge (port 3001).
      "/whatsapp-bridge": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: true,
        rewrite: (path: string) => path.replace(/^\/whatsapp-bridge/, ""),
      },
      // Proxy /menu to the menu Vite dev server (port 5173).
      "/menu": {
        target: "http://localhost:5173",
        changeOrigin: true,
        ws: true,
      },
    },
  },

  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
