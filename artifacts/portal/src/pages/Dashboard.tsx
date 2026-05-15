import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import type { Order, DashboardStats } from "@/lib/types";
import {
  IndianRupee,
  ShoppingBag,
  Clock,
  ChefHat,
  MessageCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  CreditCard,
  XCircle,
  Banknote,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Status config (covers new + legacy states) ───────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ordered:               { label: "Ordered",          color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  pending_payment:       { label: "Ordered",          color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  awaiting_confirmation: { label: "Ordered",          color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  pending:               { label: "Ordered",          color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  confirmed:             { label: "Ordered",          color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  preparing:             { label: "Preparing",        color: "bg-purple-100 text-purple-800 border-purple-200" },
  ready:                 { label: "Ready",            color: "bg-green-100 text-green-800 border-green-200" },
  completed:             { label: "Completed",        color: "bg-gray-100 text-gray-600 border-gray-200" },
  cancelled:             { label: "Cancelled",        color: "bg-red-100 text-red-600 border-red-200" },
};

// Strict one-step flow — legacy entry states all map to "preparing" next
const LEGACY_ENTRY = new Set(["ordered", "pending_payment", "awaiting_confirmation", "pending", "confirmed"]);

function getNextStatus(status: string): string | null {
  if (LEGACY_ENTRY.has(status)) return "preparing";
  if (status === "preparing") return "ready";
  if (status === "ready") return "completed";
  return null;
}

// Steps for the progress tracker (new flow only)
const TRACKER_STEPS = ["ordered", "preparing", "ready", "completed"] as const;
const TRACKER_LABELS: Record<string, string> = {
  ordered: "Ordered", preparing: "Preparing", ready: "Ready", completed: "Completed",
};

function normaliseStep(status: string): string {
  return LEGACY_ENTRY.has(status) ? "ordered" : status;
}

const ACTIVE_STATUSES = [
  "ordered", "pending_payment", "awaiting_confirmation", "pending", "confirmed", "preparing", "ready",
];

// ─── Status tracker component ─────────────────────────────────────────────────

function StatusTracker({ status }: { status: string }) {
  const current = normaliseStep(status);
  const currentIdx = TRACKER_STEPS.indexOf(current as typeof TRACKER_STEPS[number]);
  if (status === "cancelled") return null;

  return (
    <div className="flex items-center gap-0 mt-3">
      {TRACKER_STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const isLast = idx === TRACKER_STEPS.length - 1;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                  done    && "bg-orange-500 border-orange-500 text-white",
                  active  && "bg-white border-orange-500 text-orange-600 ring-2 ring-orange-200",
                  !done && !active && "bg-muted border-muted-foreground/20 text-muted-foreground/50",
                )}
              >
                {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] mt-0.5 font-medium whitespace-nowrap",
                  active  && "text-orange-600",
                  done    && "text-orange-500",
                  !done && !active && "text-muted-foreground/50",
                )}
              >
                {TRACKER_LABELS[step]}
              </span>
            </div>
            {!isLast && (
              <div className={cn("h-0.5 flex-1 mx-1 mb-3", done || active ? "bg-orange-300" : "bg-muted")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("active");
  const [orderErrors, setOrderErrors] = useState<Record<number, string>>({});

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [statsData, ordersData] = await Promise.all([
        apiFetch<DashboardStats>("/owner/stats"),
        apiFetch<Order[]>("/owner/orders"),
      ]);
      setStats(statsData);
      setOrders(ordersData);
    } catch {
      // silently fail on poll
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData, user]);

  const clearError = (id: number) =>
    setOrderErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });

  const handleStatusUpdate = async (orderId: number, status: string) => {
    clearError(orderId);
    setUpdatingId(orderId);
    try {
      await apiFetch(`/owner/orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update order";
      setOrderErrors((prev) => ({ ...prev, [orderId]: msg }));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleMarkPaid = async (orderId: number) => {
    clearError(orderId);
    setPayingId(orderId);
    try {
      await apiFetch(`/owner/orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({ paymentStatus: "paid", paymentMethod: "cash" }),
      });
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to mark as paid";
      setOrderErrors((prev) => ({ ...prev, [orderId]: msg }));
    } finally {
      setPayingId(null);
    }
  };

  const handleWhatsapp = async (orderId: number) => {
    setWhatsappLoading(orderId);
    try {
      const { url } = await apiFetch<{ url: string }>(`/owner/orders/${orderId}/whatsapp`);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      // On desktop use WhatsApp Web; on mobile wa.me opens the app directly
      const finalUrl = isMobile
        ? url
        : url.replace("https://wa.me/", "https://web.whatsapp.com/send?phone=").replace("?text=", "&text=");
      window.open(finalUrl, "whatsapp_window");
    } finally {
      setWhatsappLoading(null);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (filter === "active") return ACTIVE_STATUSES.includes(o.status);
    if (filter === "completed") return o.status === "completed";
    if (filter === "cancelled") return o.status === "cancelled";
    return true;
  });

  const subBanner = (() => {
    if (!stats) return null;
    if (stats.hasPendingUpi) {
      return {
        color: "bg-amber-50 border-amber-200 text-amber-800",
        icon: <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />,
        title: "UPI payment pending confirmation",
        body: "We received your payment request. Our admin will verify and activate your plan within 2 hours.",
        action: null,
      };
    }
    if (!stats.planId && stats.customerLimit === 0) {
      return {
        color: "bg-orange-50 border-orange-200 text-orange-900",
        icon: <CreditCard className="w-5 h-5 text-orange-500 shrink-0" />,
        title: "No active plan — subscribe to go live",
        body: "You can set up your menu and tables, but you won't be able to accept orders until you subscribe.",
        action: { label: "Subscribe Now", onClick: () => navigate("/restaurant/subscription") },
      };
    }
    if (stats.subscriptionStatus === "exhausted") {
      const limitLabel = stats.customerLimit >= 999999 ? "Unlimited" : stats.customerLimit.toLocaleString();
      return {
        color: "bg-red-50 border-red-200 text-red-900",
        icon: <XCircle className="w-5 h-5 text-red-500 shrink-0" />,
        title: "Customer limit reached — recharge your plan",
        body: `You've served all ${limitLabel} customers on your current plan. Recharge now.`,
        action: { label: "Recharge Plan", onClick: () => navigate("/restaurant/subscription") },
      };
    }
    if (stats.subscriptionStatus === "expired") {
      const expiryLabel = stats.subscriptionExpiresAt
        ? new Date(stats.subscriptionExpiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : null;
      return {
        color: "bg-red-50 border-red-200 text-red-900",
        icon: <XCircle className="w-5 h-5 text-red-500 shrink-0" />,
        title: "Subscription expired — renew to continue accepting orders",
        body: expiryLabel ? `Your plan expired on ${expiryLabel}. Renew now to keep accepting orders.` : "Your subscription has expired. Renew now to keep accepting orders.",
        action: { label: "Renew Plan", onClick: () => navigate("/restaurant/subscription") },
      };
    }
    if (stats.subscriptionStatus === "suspended") {
      return {
        color: "bg-slate-100 border-slate-300 text-slate-800",
        icon: <AlertCircle className="w-5 h-5 text-slate-500 shrink-0" />,
        title: "Account suspended",
        body: "Your account has been suspended by the admin. Please contact support to resolve this.",
        action: null,
      };
    }
    return null;
  })();

  return (
    <AppShell>
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Welcome back, {user?.name}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Subscription banner */}
        {subBanner && (
          <div className={cn("flex items-start gap-3 border rounded-xl px-5 py-4", subBanner.color)}>
            {subBanner.icon}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{subBanner.title}</p>
              <p className="text-sm mt-0.5 opacity-80">{subBanner.body}</p>
            </div>
            {subBanner.action && (
              <Button
                size="sm"
                className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={subBanner.action.onClick}
              >
                {subBanner.action.label}
              </Button>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Today's Orders", value: stats?.todayOrders ?? 0, icon: ShoppingBag, color: "text-blue-600" },
            { label: "Today's Revenue", value: `₹${stats?.todayRevenue ?? 0}`, icon: IndianRupee, color: "text-green-600" },
            { label: "Active Orders", value: stats?.activeOrders ?? 0, icon: ChefHat, color: "text-purple-600" },
            { label: "Pending", value: stats?.pendingOrders ?? 0, icon: Clock, color: "text-orange-600" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={cn("w-4 h-4", stat.color)} />
                <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Orders */}
        <div className="bg-card rounded-xl border border-border">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-base font-semibold shrink-0">Orders</h2>
            {/* Tabs: flex-wrap so they never overflow on small screens.
                whitespace-nowrap keeps each pill label on one line. */}
            <div className="flex gap-1 flex-wrap">
              {["active", "completed", "cancelled", "all"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full font-medium capitalize transition-all whitespace-nowrap",
                    filter === f
                      ? "bg-orange-500 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <AlertCircle className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">No {filter} orders</p>
              <p className="text-sm mt-1">Orders will appear here automatically</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredOrders.map((order, i) => {
                const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.ordered;
                const nextStatus = getNextStatus(order.status);
                const isUpdating = updatingId === order.id;
                const isPaying = payingId === order.id;
                const isActive = ACTIVE_STATUSES.includes(order.status);
                const isUnpaid = order.paymentStatus !== "paid";
                const orderError = orderErrors[order.id];

                return (
                  <div key={order.id} className={cn("p-4 transition-colors", i % 2 === 0 ? "bg-[#F9FAFB] hover:bg-[#F1F3F5]" : "bg-[#EEF2FF] hover:bg-[#E5EAFC]")}>
                    {/* On mobile: stack order info above buttons (flex-col).
                        On sm+: side-by-side with buttons in a right column (flex-row). */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      {/* Left: order info */}
                      <div className="flex-1 min-w-0">
                        {/* Badges row */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-sm">#{order.id}</span>
                          {order.tableNumber && (
                            <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium">
                              Table {order.tableNumber}
                            </span>
                          )}
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", cfg.color)}>
                            {cfg.label}
                          </span>
                          {isUnpaid ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-300 font-semibold">
                              UNPAID
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">
                              ✓ Paid
                            </span>
                          )}
                          {order.paymentMethod && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-medium capitalize">
                              {order.paymentMethod === "upi" ? "UPI" : order.paymentMethod}
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-medium">{order.customerName}</p>
                        <p className="text-xs text-muted-foreground">{order.customerPhone}</p>

                        {/* Status progress tracker */}
                        <StatusTracker status={order.status} />

                        {/* Unpaid warning on active orders */}
                        {isActive && isUnpaid && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Order is unpaid — collect payment before completing
                          </div>
                        )}

                        {/* Error message */}
                        {orderError && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {orderError}
                          </div>
                        )}

                        {/* Items */}
                        <div className="mt-2 space-y-0.5">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className={cn("w-2 h-2 rounded-full shrink-0", item.isVeg ? "bg-green-500" : "bg-red-500")} />
                              <span>{item.quantity}× {item.name}</span>
                              <span className="ml-auto font-medium text-foreground">₹{item.unitPrice * item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground">Subtotal ₹{order.subtotal}</span>
                          {order.tax > 0 && <span className="text-muted-foreground">Tax ₹{order.tax}</span>}
                          <span className="font-bold text-foreground">Total ₹{order.total}</span>
                        </div>
                        {order.notes && (
                          <p className="mt-1 text-xs text-muted-foreground italic">Note: {order.notes}</p>
                        )}
                      </div>

                      {/* Right: action buttons.
                          Mobile: full-width row that wraps (buttons sit below order info).
                          sm+: fixed-width vertical column beside the order info. */}
                      <div className="flex flex-row flex-wrap gap-2 sm:flex-col sm:shrink-0 sm:min-w-[140px]">
                        {/* Single advance button — driven purely by orderStatus */}
                        {nextStatus && (
                          <Button
                            size="sm"
                            className="w-full text-xs h-8 bg-orange-500 hover:bg-orange-600 text-white"
                            onClick={() => handleStatusUpdate(order.id, nextStatus)}
                            disabled={isUpdating}
                          >
                            {isUpdating
                              ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              : null}
                            {nextStatus === "preparing" && "Mark Preparing"}
                            {nextStatus === "ready"     && "Mark Ready"}
                            {nextStatus === "completed" && "Mark Completed"}
                          </Button>
                        )}

                        {/* Mark as Paid (Cash) — active + unpaid orders only */}
                        {isActive && isUnpaid && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-xs h-8 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                            onClick={() => handleMarkPaid(order.id)}
                            disabled={isPaying}
                          >
                            {isPaying
                              ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              : <Banknote className="w-3 h-3 mr-1" />}
                            Mark as Paid (Cash)
                          </Button>
                        )}

                        {/* Send Bill (WhatsApp) */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs h-8 text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => handleWhatsapp(order.id)}
                          disabled={whatsappLoading === order.id}
                        >
                          {whatsappLoading === order.id
                            ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            : <MessageCircle className="w-3 h-3 mr-1" />}
                          Send Bill
                        </Button>

                        {/* Cancel — only for non-terminal orders */}
                        {order.status !== "completed" && order.status !== "cancelled" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full text-xs h-8 text-destructive hover:text-destructive"
                            onClick={() => handleStatusUpdate(order.id, "cancelled")}
                            disabled={isUpdating}
                          >
                            Cancel Order
                          </Button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(order.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {new Date(order.createdAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
