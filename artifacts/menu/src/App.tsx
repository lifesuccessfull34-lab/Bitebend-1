import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChatzyWidget } from "@/components/ChatzyWidget";

import MenuPage from "@/pages/MenuPage";
import OrderHistoryPage from "@/pages/OrderHistoryPage";
import NotFound from "@/pages/not-found";

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

        {/* Order history */}
        <Route path="/my-orders/" component={OrderHistoryPage} />
        <Route path="/my-orders" component={OrderHistoryPage} />

        {/* New QR routes (Netlify + restaurant slug support) */}
        <Route path="/menu/:restaurantId/table/:tableId/" component={MenuPage} />
        <Route path="/menu/:restaurantId/table/:tableId" component={MenuPage} />

        <Route path="/menu/:restaurantId/" component={MenuPage} />
        <Route path="/menu/:restaurantId" component={MenuPage} />

        {/* Legacy routes kept for backward compatibility */}
        <Route path="/:restaurantId/table/:tableId/" component={MenuPage} />
        <Route path="/:restaurantId/table/:tableId" component={MenuPage} />

        <Route path="/:restaurantId/" component={MenuPage} />
        <Route path="/:restaurantId" component={MenuPage} />

        {/* Generic menu page */}
        <Route path="/menu" component={MenuPage} />

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
      <ChatzyWidget />
    </ErrorBoundary>
  );
}

export default App;
