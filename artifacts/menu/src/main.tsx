import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { initScrollDebug } from "./scroll-debug";

// ── Build info ────────────────────────────────────────────────────────────────
//
// __APP_BUILD__ is injected by Vite's `define` config at build time — the
// object is baked into the JS bundle and never changes at runtime.
//
// Exposed on window so you can always inspect it from browser devtools:
//   window.__BUILD_INFO__
// → { commit: "abc1234", timestamp: "2026-05-13T...", version: "0.0.0" }
//
// console.info is stripped from production bundles by terser, but
// window.__BUILD_INFO__ persists so it remains accessible at any time.

window.__BUILD_INFO__ = __APP_BUILD__;

if (import.meta.env.DEV) {
  console.info(
    `[Bitebend] build commit=${__APP_BUILD__.commit} ts=${__APP_BUILD__.timestamp} v=${__APP_BUILD__.version}`,
  );
}

// ── Loader dismissal ──────────────────────────────────────────────────────────

function hideLoader() {
  try {
    (window as unknown as { __clearMenuLoadingTimer__?: () => void }).__clearMenuLoadingTimer__?.();
  } catch {}
  const loader = document.getElementById("app-loading");
  if (loader) {
    loader.style.transition = "opacity 0.2s ease";
    loader.style.opacity = "0";
    setTimeout(() => loader.remove(), 250);
  }
}

// ── Scroll diagnostics (opt-in) ───────────────────────────────────────────────
//
// Activate from DevTools on any device:
//   window.__SCROLL_DEBUG__ = true;   ← set before page load for full coverage
//   window.__SCROLL_DEBUG_STOP__();   ← tear down when done
//
// Or append #__scroll_debug__ to the URL — the module checks the hash on init.
initScrollDebug();

// ── Mount ─────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById("root");
if (!rootEl) {
  hideLoader();
  document.body.innerHTML =
    '<div style="padding:2rem;font-family:sans-serif;color:#c00">Fatal: #root element missing.</div>';
} else {
  const root = createRoot(rootEl);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
  requestAnimationFrame(hideLoader);
}
