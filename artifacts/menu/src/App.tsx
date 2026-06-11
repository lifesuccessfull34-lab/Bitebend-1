import { Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import MenuPage from "@/pages/MenuPage";
import OrderHistoryPage from "@/pages/OrderHistoryPage";
import NotFound from "@/pages/not-found";

// ─── Client-side error telemetry ──────────────────────────────────────────────
//
// Sends a fire-and-forget beacon to the API so production React crashes are
// visible in server logs alongside route / UA context. Uses sendBeacon so the
// request survives page unload. The endpoint just logs — no DB write.

interface ErrorPayload {
  message: string;
  stack: string;
  componentStack: string;
  url: string;
  ua: string;
  ts: number;
  build: typeof __APP_BUILD__ | null;
}

function sendErrorBeacon(payload: ErrorPayload): void {
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/menu/client-error", blob);
    }
  } catch {
    // sendBeacon unavailable (some Android WebViews) — fall through silently
  }
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    sendErrorBeacon({
      message: error.message,
      stack: error.stack ?? "",
      componentStack: info.componentStack,
      url: typeof window !== "undefined" ? window.location.href : "",
      ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
      ts: Date.now(),
      build: typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : null,
    });
    // Always log to console so browser devtools / remote-debugging sessions
    // show the full stack even when the beacon succeeds.
    console.error("[ErrorBoundary] React crash captured:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h1>
            <p className="text-muted-foreground text-sm mb-5">
              The menu could not be loaded. Please try scanning the QR code again.
            </p>
            <button
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Scan prompt (no QR context) ─────────────────────────────────────────────

function ScanPrompt() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Bitebend</h1>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          Please scan the QR code on your table to view the menu and place your order.
        </p>
      </div>
    </div>
  );
}

// ─── Location logger (dev-only) ───────────────────────────────────────────────
//
// Logs route changes to the browser console in development only. Removed from
// production builds by the minifier via the import.meta.env.DEV guard.

function LocationLogger() {
  const [location] = useLocation();
  if (import.meta.env.DEV) {
    console.debug("[menu] route:", location);
  }
  return null;
}

// ─── Router ───────────────────────────────────────────────────────────────────
//
// Trailing-slash variants are declared explicitly so that Google Lens / Samsung
// Browser / Android WebView URLs like "/spice-garden/" match without any
// runtime navigation component.
//
// IMPORTANT — do NOT introduce a component that calls navigate() during render:
//
//   ❌ WRONG  (causes React error #310 "Maximum update depth exceeded"):
//     function Redirector() {
//       const [loc, navigate] = useLocation();
//       if (loc.endsWith("/")) navigate(loc.slice(0, -1));  // ← during render!
//       return null;
//     }
//
//   ✅ CORRECT — add explicit route variants instead (zero side effects):
//     <Route path="/:restaurantId/" component={MenuPage} />
//     <Route path="/:restaurantId"  component={MenuPage} />
//
// The navigate-in-render antipattern is also checked by:
//   pnpm run check:render-safety

function Router() {
  return (
    <>
      <LocationLogger />
      <Switch>
        <Route path="/my-orders/" component={OrderHistoryPage} />
        <Route path="/my-orders" component={OrderHistoryPage} />
        <Route path="/:restaurantId/table/:tableId/" component={MenuPage} />
        <Route path="/:restaurantId/table/:tableId" component={MenuPage} />
        <Route path="/:restaurantId/" component={MenuPage} />
        <Route path="/:restaurantId" component={MenuPage} />
        <Route path="/" component={ScanPrompt} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <ErrorBoundary>
      <WouterRouter base="/">
        <Router />
      </WouterRouter>
      <Toaster />
    </ErrorBoundary>
  );
}

export default App;
