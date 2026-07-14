import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { lazy, Suspense, Component, useState, useCallback, useRef, useEffect, type ReactNode, type ErrorInfo } from "react";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { SessionWarningDialog } from "@/components/SessionWarningDialog";

// ── Eagerly import the pages users land on first ─────────────────────────────
// These MUST be in the main bundle (not lazy chunks) so that a transient
// network error on mobile never blocks the login screen from appearing.
import RestaurantAuth    from "@/pages/RestaurantAuth";
import AdminLogin        from "@/pages/AdminLogin";

// ── lazyWithRetry — retry failed chunk loads once before giving up ────────────
// On mobile networks a dynamic import can fail transiently. One retry is
// usually enough to recover without showing an error to the user.
function lazyWithRetry<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch(() => {
      // Wait briefly then retry once. If it fails again, propagate the error
      // so the ErrorBoundary can show a reload prompt.
      return new Promise<{ default: T }>((resolve, reject) =>
        setTimeout(() => factory().then(resolve).catch(reject), 1200),
      );
    }),
  );
}

// ── Lazy-load all non-critical pages ────────────────────────────────────────
// These load only when the user navigates to them, after the initial auth
// check has completed and the login/dashboard page is already visible.
const AdminForgotPassword = lazyWithRetry(() => import("@/pages/AdminForgotPassword"));
const AdminResetPassword  = lazyWithRetry(() => import("@/pages/AdminResetPassword"));
const ResetPassword       = lazyWithRetry(() => import("@/pages/ResetPassword"));
const RegisterPage      = lazyWithRetry(() => import("@/pages/RegisterPage"));
const TermsPage         = lazyWithRetry(() => import("@/pages/TermsPage"));
const PrivacyPolicyPage = lazyWithRetry(() => import("@/pages/PrivacyPolicyPage"));
const Dashboard         = lazyWithRetry(() => import("@/pages/Dashboard"));
const MenuManagement    = lazyWithRetry(() => import("@/pages/MenuManagement"));
const TablesManagement  = lazyWithRetry(() => import("@/pages/TablesManagement"));
const Profile           = lazyWithRetry(() => import("@/pages/Profile"));
const Admin             = lazyWithRetry(() => import("@/pages/Admin"));
const Subscription      = lazyWithRetry(() => import("@/pages/Subscription"));
const CustomerAnalytics  = lazyWithRetry(() => import("@/pages/CustomerAnalytics"));
const WhatsAppConnect    = lazyWithRetry(() => import("@/pages/WhatsAppConnect"));
const ResourcesCenter   = lazyWithRetry(() => import("@/pages/resources/ResourcesCenter"));
const ResourcesManage   = lazyWithRetry(() => import("@/pages/resources/ResourcesManage"));
const Logout            = lazyWithRetry(() => import("@/pages/Logout"));
const NotFound          = lazyWithRetry(() => import("@/pages/not-found"));

const queryClient = new QueryClient();

function Spinner() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px", background: "#fff8f5" }}>
      <Loader2 style={{ width: 32, height: 32, color: "#f97316", animation: "spin 1s linear infinite" }} />
      <p style={{ color: "#888", fontSize: "14px", margin: 0, fontFamily: "Inter, sans-serif" }}>Loading…</p>
    </div>
  );
}

// ── Chunk error boundary ──────────────────────────────────────────────────────
// Wraps lazy routes so a chunk loading failure shows a targeted reload prompt
// rather than crashing the whole app via the root ErrorBoundary.
interface ChunkEBState { failed: boolean }
class ChunkErrorBoundary extends Component<{ children: ReactNode }, ChunkEBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): ChunkEBState { return { failed: true }; }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[ChunkErrorBoundary]", err, info.componentStack);
  }
  render() {
    if (this.state.failed) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px", fontFamily: "Inter, sans-serif", padding: "24px", textAlign: "center", background: "#fff8f5" }}>
          <p style={{ color: "#666", fontSize: "14px", margin: 0 }}>Failed to load page. Check your connection.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#f97316", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 24px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Public route for restaurant owners.
 * - Loading → null (HTML spinner still visible; React hasn't dismissed it yet)
 * - Logged in as admin → /admin/dashboard
 * - Logged in as owner → /restaurant/dashboard
 * - Not logged in → show component
 */
function RestaurantPublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role === "super_admin") return <Redirect to="/admin/dashboard" />;
  if (user) return <Redirect to="/restaurant/dashboard" />;
  return <Component />;
}

/**
 * Public route for admin.
 * - Loading → null (HTML spinner still visible)
 * - Logged in as admin → /admin/dashboard
 */
function AdminPublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role === "super_admin") return <Redirect to="/admin/dashboard" />;
  return <Component />;
}

/**
 * Protected route — restaurant owners only.
 * - Loading → null (HTML spinner still visible)
 * - Not logged in → /restaurant/auth
 * - Logged in as admin → /admin/dashboard
 * - Logged in as owner → show component
 */
function RestaurantRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect to="/restaurant/auth" />;
  if (user.role === "super_admin") return <Redirect to="/admin/dashboard" />;
  return <Component />;
}

/**
 * Protected route — admin only.
 * - Loading → null (HTML spinner still visible)
 * - Not logged in → /admin/login
 * - Logged in as owner → /restaurant/dashboard
 * - Logged in as admin → show component
 */
function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect to="/admin/login" />;
  if (user.role !== "super_admin") return <Redirect to="/restaurant/dashboard" />;
  return <Component />;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Redirect to={user?.role === "super_admin" ? "/admin/dashboard" : "/restaurant/auth"} />;
}

// ── Session auto-logout ───────────────────────────────────────────────────────
const OWNER_TIMEOUT_MS  = 2  * 60 * 60 * 1000; // 2 hours
const ADMIN_TIMEOUT_MS  = 30 * 60 * 1000;       // 30 minutes
const WARNING_LEAD_MS   = 2  * 60 * 1000;       // show warning 2 minutes before

/**
 * Renders the session-expiry warning dialog inside the AuthProvider tree.
 * Owner logins expire after 2 h of inactivity; admin logins after 30 min.
 * A "Stay Logged In" button resets the timer and pings /auth/me so the
 * server session cookie is refreshed.
 */
function SessionGuard() {
  const { user, logout, refresh } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timeoutMs = user?.role === "super_admin" ? ADMIN_TIMEOUT_MS : OWNER_TIMEOUT_MS;

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  const handleWarning = useCallback(() => {
    setShowWarning(true);
    setSecondsLeft(Math.floor(WARNING_LEAD_MS / 1000));
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { stopCountdown(); return 0; }
        return s - 1;
      });
    }, 1000);
  }, [stopCountdown]);

  const handleTimeout = useCallback(() => {
    stopCountdown();
    setShowWarning(false);
    logout().catch(() => {});
  }, [logout, stopCountdown]);

  const { reset } = useInactivityTimer({
    timeoutMs,
    warningMs: WARNING_LEAD_MS,
    onWarning: handleWarning,
    onTimeout: handleTimeout,
    enabled: !!user,
  });

  const handleKeepAlive = useCallback(() => {
    stopCountdown();
    setShowWarning(false);
    reset();
    refresh().catch(() => {});
  }, [reset, refresh, stopCountdown]);

  const handleLogout = useCallback(() => {
    stopCountdown();
    setShowWarning(false);
    logout().catch(() => {});
  }, [logout, stopCountdown]);

  useEffect(() => () => stopCountdown(), [stopCountdown]);

  if (!user) return null;

  return (
    <SessionWarningDialog
      open={showWarning}
      secondsRemaining={secondsLeft}
      onKeepAlive={handleKeepAlive}
      onLogout={handleLogout}
    />
  );
}

// ── Stable route wrappers ────────────────────────────────────────────────────
// Defined ONCE at module level so Route never sees a new component reference
// on re-render, preventing unexpected unmount/remount cycles.
const RestaurantToDashboard = () => <Redirect to="/restaurant/dashboard" />;
const AdminToDashboard      = () => <Redirect to="/admin/dashboard" />;

const RestaurantAuthPage    = () => <RestaurantPublicRoute component={RestaurantAuth} />;
const RegisterPage_         = () => <RestaurantPublicRoute component={RegisterPage} />;
const DashboardPage         = () => <RestaurantRoute component={Dashboard} />;
const MenuManagementPage    = () => <RestaurantRoute component={MenuManagement} />;
const TablesManagementPage  = () => <RestaurantRoute component={TablesManagement} />;
const ProfilePage           = () => <RestaurantRoute component={Profile} />;
const SubscriptionPage         = () => <RestaurantRoute component={Subscription} />;
const CustomerAnalyticsPage    = () => <RestaurantRoute component={CustomerAnalytics} />;
const WhatsAppConnectPage      = () => <RestaurantRoute component={WhatsAppConnect} />;
const ResourcesCenterPage      = () => <ResourcesCenter />;
const ResourcesManagePage      = () => <AdminRoute component={ResourcesManage} />;
const RestaurantCatchAll       = () => <RestaurantRoute component={RestaurantToDashboard} />;
const AdminLoginPage           = () => <AdminPublicRoute component={AdminLogin} />;
const AdminForgotPasswordPage  = () => <AdminForgotPassword />;
const AdminResetPasswordPage   = () => <AdminResetPassword />;
const ResetPasswordPage        = () => <ResetPassword />;
const AdminDashboardPage       = () => <AdminRoute component={Admin} />;
const AdminCatchAll            = () => <AdminRoute component={AdminToDashboard} />;

// Legacy redirect pages
const ToRestaurantAuth     = () => <Redirect to="/restaurant/auth" />;
const ToRegister           = () => <Redirect to="/restaurant/register" />;
const ToAdminLogin         = () => <Redirect to="/admin/login" />;
const ToDashboard          = () => <Redirect to="/restaurant/dashboard" />;
const ToMenu               = () => <Redirect to="/restaurant/menu" />;
const ToTables             = () => <Redirect to="/restaurant/tables" />;
const ToProfile            = () => <Redirect to="/restaurant/profile" />;
const ToSubscription       = () => <Redirect to="/restaurant/subscription" />;
const ToAdminDashboard     = () => <Redirect to="/admin/dashboard" />;

function Router() {
  return (
    <Switch>
      {/* Root — redirect based on role */}
      <Route path="/" component={RootRedirect} />

      {/* ── Restaurant auth (public) ──────────────────────────────────── */}
      <Route path="/restaurant/auth"         component={RestaurantAuthPage} />
      <Route path="/restaurant/register"     component={RegisterPage_} />
      <Route path="/restaurant/reset-password" component={ResetPasswordPage} />

      {/* ── Restaurant protected (owner only) ────────────────────────── */}
      <Route path="/restaurant/dashboard"    component={DashboardPage} />
      <Route path="/restaurant/menu"         component={MenuManagementPage} />
      <Route path="/restaurant/tables"       component={TablesManagementPage} />
      <Route path="/restaurant/profile"      component={ProfilePage} />
      <Route path="/restaurant/subscription"           component={SubscriptionPage} />
      <Route path="/restaurant/customers/analytics"    component={CustomerAnalyticsPage} />
      <Route path="/restaurant/whatsapp"               component={WhatsAppConnectPage} />
      <Route path="/restaurant/resources/manage"       component={() => <Redirect to="/admin/resources" />} />
      <Route path="/restaurant/resources"              component={() => <Redirect to="/portal/resources" />} />

      {/* ── Catch-all for any unknown /restaurant/* path ─────────────── */}
      <Route path="/restaurant/:rest*"       component={RestaurantCatchAll} />

      {/* ── Admin auth (public) ───────────────────────────────────────── */}
      <Route path="/admin/login"             component={AdminLoginPage} />
      <Route path="/admin/forgot-password"   component={AdminForgotPasswordPage} />
      <Route path="/admin/reset-password"    component={AdminResetPasswordPage} />

      {/* ── Public resource portal (no auth required) ────────────────── */}
      {/* /portal/resources — canonical URL (production / artifact mode, no Wouter base) */}
      <Route path="/portal/resources"        component={ResourcesCenterPage} />
      {/* /resources — same page, matched when Wouter base="/portal" strips the prefix (Start application dev mode) */}
      <Route path="/resources"               component={ResourcesCenterPage} />

      {/* ── /portal/* → strip prefix and redirect (Replit canvas artifact iframe compat) ── */}
      <Route path="/portal/:rest*" component={({ params }: { params: { rest?: string } }) => {
        const rest = params.rest ?? "";
        return <Redirect to={rest ? `/${rest}` : "/"} />;
      }} />
      <Route path="/portal" component={() => <Redirect to="/" />} />

      {/* ── Admin protected (super_admin only) ───────────────────────── */}
      <Route path="/admin/resources"         component={ResourcesManagePage} />
      <Route path="/admin/dashboard"         component={AdminDashboardPage} />

      {/* ── Catch-all for any unknown /admin/* path ──────────────────── */}
      <Route path="/admin/:rest*"            component={AdminCatchAll} />

      {/* Legal pages (public, no auth required) */}
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy-policy" component={PrivacyPolicyPage} />

      {/* Logout */}
      <Route path="/logout" component={Logout} />

      {/* Legacy redirects */}
      <Route path="/login"        component={ToRestaurantAuth} />
      <Route path="/register"     component={ToRegister} />
      <Route path="/admin-login"  component={ToAdminLogin} />
      <Route path="/dashboard"    component={ToDashboard} />
      <Route path="/menu"         component={ToMenu} />
      <Route path="/tables"       component={ToTables} />
      <Route path="/profile"      component={ToProfile} />
      <Route path="/subscription" component={ToSubscription} />
      <Route path="/admin"        component={ToAdminDashboard} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter
            base={
              window.location.pathname.startsWith("/portal")
                ? "/portal"
                : import.meta.env.BASE_URL.replace(/\/$/, "")
            }
          >
            <ChunkErrorBoundary>
              <Suspense fallback={<Spinner />}>
                <Router />
              </Suspense>
            </ChunkErrorBoundary>
          </WouterRouter>
          <Toaster />
          <SessionGuard />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
