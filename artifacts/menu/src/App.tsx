import { Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";

import MenuPage from "@/pages/MenuPage";
import OrderHistoryPage from "@/pages/OrderHistoryPage";
import NotFound from "@/pages/not-found";

/* ─────────────────────────────────────────────────────────────
   Error Telemetry
───────────────────────────────────────────────────────────── */

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
  } catch {}
}

/* ─────────────────────────────────────────────────────────────
   Error Boundary
───────────────────────────────────────────────────────────── */

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    sendErrorBeacon({
      message: error.message,
      stack: error.stack ?? "",
      componentStack: info.componentStack,
      url: window.location.href,
      ua: navigator.userAgent,
      ts: Date.now(),
      build: typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : null,
    });

    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center">
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <button
              className="px-4 py-2 bg-black text-white rounded"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/* ─────────────────────────────────────────────────────────────
   Scan Prompt
───────────────────────────────────────────────────────────── */

function ScanPrompt() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Bitebend</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Scan QR code to continue
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Route Logger
───────────────────────────────────────────────────────────── */

function LocationLogger() {
  const [location] = useLocation();

  if (import.meta.env.DEV) {
    console.log("[route]", location);
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────
   Router (FIXED SAFE VERSION)
───────────────────────────────────────────────────────────── */

function Router() {
  return (
    <>
      <LocationLogger />

      <Switch>

        {/* ✅ STATIC ROUTES FIRST (IMPORTANT FIX) */}
        <Route path="/menu" component={MenuPage} />
        <Route path="/portal/restaurant/auth" component={ScanPrompt} />
        <Route path="/portal/*" component={ScanPrompt} />

        <Route path="/my-orders/" component={OrderHistoryPage} />
        <Route path="/my-orders" component={OrderHistoryPage} />

        {/* 🔥 DYNAMIC ROUTES LAST (VERY IMPORTANT) */}
        <Route path="/:restaurantId/table/:tableId/" component={MenuPage} />
        <Route path="/:restaurantId/table/:tableId" component={MenuPage} />

        <Route path="/:restaurantId/" component={MenuPage} />
        <Route path="/:restaurantId" component={MenuPage} />

        {/* Home */}
        <Route path="/" component={ScanPrompt} />

        {/* Fallback */}
        <Route component={NotFound} />

      </Switch>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   App Root
───────────────────────────────────────────────────────────── */

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
