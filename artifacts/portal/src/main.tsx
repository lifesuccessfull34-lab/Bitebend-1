import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

// Hide the inline loading screen added in index.html.
// Called by AuthContext when the auth check settles (loading → false),
// NOT on first render — this ensures the HTML spinner stays visible until
// React has actually rendered the login page or dashboard beneath it.
// The safety-net timer in index.html will also call this via __clearAppLoadingTimer__
// if something goes catastrophically wrong.
function hideLoader() {
  try {
    (window as unknown as { __clearAppLoadingTimer__?: () => void }).__clearAppLoadingTimer__?.();
  } catch {}
  const loader = document.getElementById("app-loading");
  if (loader) {
    loader.style.transition = "opacity 0.25s ease";
    loader.style.opacity = "0";
    setTimeout(() => loader.remove(), 300);
  }
}

// Expose to AuthContext so it can dismiss the HTML spinner once auth settles.
(window as unknown as { __hideAppLoader__?: () => void }).__hideAppLoader__ = hideLoader;

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
  // NOTE: Do NOT call hideLoader() here. Let AuthContext call it via
  // window.__hideAppLoader__ when the auth check completes, so the HTML
  // spinner stays up until the login/dashboard page is actually ready.
}
