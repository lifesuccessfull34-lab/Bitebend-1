import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";
import type { Order, DashboardStats, SessionSummary, SessionBill } from "@/lib/types";
import { HistoryTab } from "@/pages/history/HistoryTab";
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
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  BadgeCheck,
  ScanLine,
  Send,
  UserCheck,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  UtensilsCrossed,
  Receipt,
  Camera,
  Eye,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ordered:               { label: "Ordered",        color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  pending_payment:       { label: "Ordered",        color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  awaiting_confirmation: { label: "Ordered",        color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  pending:               { label: "Ordered",        color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  confirmed:             { label: "Ordered",        color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  preparing:             { label: "Preparing",      color: "bg-purple-100 text-purple-800 border-purple-200" },
  ready:                 { label: "Ready",          color: "bg-green-100 text-green-800 border-green-200" },
  completed:             { label: "Completed",      color: "bg-gray-100 text-gray-600 border-gray-200" },
  cancelled:             { label: "Cancelled",      color: "bg-red-100 text-red-600 border-red-200" },
  payment_failed:        { label: "Payment Failed", color: "bg-red-100 text-red-700 border-red-300" },
};

const LEGACY_ENTRY = new Set(["ordered", "pending_payment", "awaiting_confirmation", "pending", "confirmed"]);

function getNextStatus(status: string): string | null {
  if (LEGACY_ENTRY.has(status)) return "preparing";
  if (status === "preparing") return "ready";
  if (status === "ready") return "completed";
  return null;
}

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

function extractUtr(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/UTR:\s*([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

interface OcrData {
  amount: number | null;
  utr: string | null;
  status: string | null;
  merchant: string | null;
  timestamp: string | null;
  confidence: number;
  ocrConfigured: boolean;
  error?: string;
}


// ─── Status tracker ────────────────────────────────────────────────────────────

function StatusTracker({ status }: { status: string }) {
  const current = normaliseStep(status);
  const currentIdx = TRACKER_STEPS.indexOf(current as typeof TRACKER_STEPS[number]);
  if (status === "cancelled") return null;

  return (
    <div className="flex items-center gap-0 mt-3">
      {TRACKER_STEPS.map((step, idx) => {
        const done   = idx < currentIdx;
        const active = idx === currentIdx;
        const isLast = idx === TRACKER_STEPS.length - 1;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                done   && "bg-orange-500 border-orange-500 text-white",
                active && "bg-white border-orange-500 text-orange-600 ring-2 ring-orange-200",
                !done && !active && "bg-muted border-muted-foreground/20 text-muted-foreground/50",
              )}>
                {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              <span className={cn(
                "text-[10px] mt-0.5 font-medium whitespace-nowrap",
                active && "text-orange-600",
                done   && "text-orange-500",
                !done && !active && "text-muted-foreground/50",
              )}>
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

// ─── Main dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(() => new Set());
  const [newOrderSessionIds, setNewOrderSessionIds] = useState<Set<number>>(() => {
    try { return new Set<number>(JSON.parse(localStorage.getItem("bb_new_session_badges") ?? "[]")); }
    catch { return new Set(); }
  });
  const [showPasswordReminder, setShowPasswordReminder] = useState(() => {
    try {
      const ts = localStorage.getItem("bb_pw_reminder_dismissed_at");
      if (!ts) return true;
      return Date.now() - parseInt(ts, 10) > 30 * 24 * 60 * 60 * 1000;
    } catch { return false; }
  });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId]       = useState<number | null>(null);
  const [verifyingId, setVerifyingId]     = useState<number | null>(null);
  const [rejectingId, setRejectingId]     = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("active");
  const [orderErrors, setOrderErrors] = useState<Record<number, string>>({});


  // Tracks the last WhatsApp tab opened by "Send Bill".
  const waWindowRef = useRef<Window | null>(null);


  // Session bill generation
  const [generatingBillId, setGeneratingBillId] = useState<number | null>(null);

  // Session bill: send / approve / reject / mark-paid
  const [sendingBillSessionId, setSendingBillSessionId] = useState<number | null>(null);
  const [approvingBillSessionId, setApprovingBillSessionId] = useState<number | null>(null);
  const [rejectingBillSessionId, setRejectingBillSessionId] = useState<number | null>(null);
  const [markingPaidSessionId, setMarkingPaidSessionId] = useState<number | null>(null);

  // Session bill screenshot viewer
  const [sessionScreenshots, setSessionScreenshots] = useState<Map<number, string>>(new Map());
  const [loadingScreenshotSessionId, setLoadingScreenshotSessionId] = useState<number | null>(null);
  const [viewingScreenshotSessionId, setViewingScreenshotSessionId] = useState<number | null>(null);
  const [sessionBillImageZoomed, setSessionBillImageZoomed] = useState(false);

  // Incomplete-orders guard modal — shown when Generate Bill is clicked before all orders are completed
  const [incompleteOrdersModal, setIncompleteOrdersModal] = useState<{ sessionId: number; orders: Order[] } | null>(null);

  // View Bill modal — shows itemized bill for a session
  const [viewingBillSessionId, setViewingBillSessionId] = useState<number | null>(null);


  const handleSessionScreenshotReceived = useCallback((sessionId: number) => {
    setSessionScreenshots((prev) => { const next = new Map(prev); next.delete(sessionId); return next; });
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [statsData, ordersData, sessionsData] = await Promise.all([
        apiFetch<DashboardStats>("/owner/stats"),
        apiFetch<Order[]>("/owner/orders"),
        apiFetch<SessionSummary[]>("/owner/sessions"),
      ]);
      setStats(statsData);
      setOrders(ordersData);
      setSessions(sessionsData);
      // Detect new orders added to existing sessions — localStorage-backed so badge survives refresh
      try {
        const storedCounts: Record<string, number> = JSON.parse(localStorage.getItem("bb_session_order_counts") ?? "{}");
        const storedBadges: number[] = JSON.parse(localStorage.getItem("bb_new_session_badges") ?? "[]");
        const badges = new Set<number>(storedBadges);
        const updatedCounts: Record<string, number> = { ...storedCounts };
        for (const session of sessionsData) {
          const knownCount = storedCounts[String(session.id)];
          if (knownCount !== undefined && session.orderCount > Number(knownCount)) badges.add(session.id);
          updatedCounts[String(session.id)] = session.orderCount;
        }
        // Clean up badges for sessions that are no longer in the active list
        for (const badgeId of badges) {
          if (!sessionsData.find((s) => s.id === badgeId)) badges.delete(badgeId);
        }
        localStorage.setItem("bb_session_order_counts", JSON.stringify(updatedCounts));
        localStorage.setItem("bb_new_session_badges", JSON.stringify([...badges]));
        setNewOrderSessionIds(badges);
      } catch { /* ignore storage errors */ }
    } catch { /* silently fail on poll */ } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData, user]);

  useOrderNotifications({ enabled: !!user && user.role === "owner", onNewOrder: fetchData });

  const handleGenerateBill = useCallback(async (sessionId: number) => {
    // Pre-flight: block if any non-cancelled, non-completed orders exist.
    // Mirrors the backend generateBill 409 guard — frontend convenience only.
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      const incomplete = session.orders.filter(
        (o) => o.status !== "cancelled" && o.status !== "payment_failed" && o.status !== "completed",
      );
      if (incomplete.length > 0) {
        setIncompleteOrdersModal({ sessionId, orders: incomplete });
        return;
      }
    }
    setGeneratingBillId(sessionId);
    try {
      await apiFetch<SessionBill>(`/owner/sessions/${sessionId}/bill`, { method: "POST" });
      toast.success("Bill generated — table moved to awaiting payment");
      await fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate bill");
    } finally {
      setGeneratingBillId(null);
    }
  }, [fetchData, sessions]);

  const handleSendSessionBill = useCallback(async (sessionId: number) => {
    setSendingBillSessionId(sessionId);
    try {
      const data = await apiFetch<{
        ok: boolean;
        billNumber: string;
        customerPhone: string;
        customerName: string;
        deliveryMethod: "bridge" | "deeplink";
        sent: boolean;
        whatsappUrl: string | null;
      }>(`/owner/sessions/${sessionId}/bill/send`, { method: "POST" });

      if (data.deliveryMethod === "bridge" && data.sent) {
        toast.success(`Bill sent to ${data.customerName} via WhatsApp ✓`);
      } else if (data.whatsappUrl) {
        if (waWindowRef.current && !waWindowRef.current.closed) waWindowRef.current.close();
        waWindowRef.current = window.open(data.whatsappUrl, "_blank") ?? null;
        toast.success("WhatsApp opened — tap Send to deliver the bill");
      }
      await fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send bill");
    } finally {
      setSendingBillSessionId(null);
    }
  }, [fetchData]);

  const handleApproveSessionBill = useCallback(async (sessionId: number) => {
    setApprovingBillSessionId(sessionId);
    try {
      await apiFetch(`/owner/sessions/${sessionId}/bill/approve`, { method: "PATCH" });
      toast.success("Payment approved — session closed ✓");
      setViewingScreenshotSessionId(null);
      await fetchData();
      setActiveTab("history");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to approve payment");
    } finally {
      setApprovingBillSessionId(null);
    }
  }, [fetchData]);

  const handleRejectSessionBill = useCallback(async (sessionId: number) => {
    setRejectingBillSessionId(sessionId);
    try {
      await apiFetch(`/owner/sessions/${sessionId}/bill/reject`, { method: "PATCH" });
      toast.success("Payment rejected — waiting for new screenshot");
      setViewingScreenshotSessionId(null);
      await fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reject payment");
    } finally {
      setRejectingBillSessionId(null);
    }
  }, [fetchData]);

  const handleMarkSessionPaid = useCallback(async (sessionId: number) => {
    setMarkingPaidSessionId(sessionId);
    try {
      await apiFetch(`/owner/sessions/${sessionId}/bill/mark-paid`, { method: "PATCH" });
      toast.success("Payment recorded — session closed ✓");
      await fetchData();
      setActiveTab("history");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to mark payment");
    } finally {
      setMarkingPaidSessionId(null);
    }
  }, [fetchData]);

  const loadSessionScreenshot = useCallback(async (sessionId: number) => {
    if (sessionScreenshots.has(sessionId)) {
      setViewingScreenshotSessionId(sessionId);
      setSessionBillImageZoomed(false);
      return;
    }
    setLoadingScreenshotSessionId(sessionId);
    try {
      const data = await apiFetch<{ screenshotUrl: string }>(`/owner/sessions/${sessionId}/bill/screenshot`);
      setSessionScreenshots((prev) => new Map(prev).set(sessionId, data.screenshotUrl));
      setViewingScreenshotSessionId(sessionId);
      setSessionBillImageZoomed(false);
    } catch {
      toast.error("Could not load screenshot");
    } finally {
      setLoadingScreenshotSessionId(null);
    }
  }, [sessionScreenshots]);

  const clearError = (id: number) =>
    setOrderErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });

  const handleStatusUpdate = async (orderId: number, status: string) => {
    clearError(orderId);
    setUpdatingId(orderId);
    try {
      await apiFetch(`/owner/orders/${orderId}`, { method: "PUT", body: JSON.stringify({ status }) });
      // Clear the NEW badge when staff clicks "Mark Preparing" on any order in the session
      if (status === "preparing") {
        const owningSession = sessions.find((s) => s.orders.some((o) => o.id === orderId));
        if (owningSession) {
          setNewOrderSessionIds((prev) => {
            const next = new Set(prev);
            next.delete(owningSession.id);
            try {
              const stored: number[] = JSON.parse(localStorage.getItem("bb_new_session_badges") ?? "[]");
              localStorage.setItem("bb_new_session_badges", JSON.stringify(stored.filter((id) => id !== owningSession.id)));
            } catch { /* ignore */ }
            return next;
          });
        }
      }
      await fetchData();
    } catch (err: unknown) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: err instanceof Error ? err.message : "Failed" }));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleVerifyUpi = async (orderId: number) => {
    clearError(orderId);
    setVerifyingId(orderId);
    try {
      await apiFetch(`/owner/orders/${orderId}/verify-upi`, { method: "POST" });
      await fetchData();
    } catch (err: unknown) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: err instanceof Error ? err.message : "Failed" }));
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRejectUpi = async (orderId: number) => {
    clearError(orderId);
    setRejectingId(orderId);
    try {
      await apiFetch(`/owner/orders/${orderId}/reject-upi`, { method: "POST" });
      await fetchData();
    } catch (err: unknown) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: err instanceof Error ? err.message : "Failed" }));
    } finally {
      setRejectingId(null);
    }
  };


  // Orders belonging to any displayed session — shown in the Sessions section, not below
  const activeSessionOrderIds = new Set(
    sessions
      .filter((s) => s.status === "active" || s.status === "awaiting_payment" || s.status === "awaiting_verification")
      .flatMap((s) => s.orders.map((o) => o.id)),
  );

  const filteredOrders = orders.filter((o) => {
    // Orders in active sessions are shown in the Sessions section, not here
    if (activeSessionOrderIds.has(o.id)) return false;
    if (filter === "active")    return ACTIVE_STATUSES.includes(o.status);
    if (filter === "completed") return o.status === "completed";
    if (filter === "cancelled") return o.status === "cancelled" || o.status === "payment_failed";
    return true;
  });


  const subBanner = (() => {
    if (!stats) return null;
    if (stats.hasPendingUpi) return {
      color: "bg-amber-50 border-amber-200 text-amber-800",
      icon: <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />,
      title: "UPI payment pending confirmation",
      body: "We received your payment request. Our admin will verify and activate your plan within 2 hours.",
      action: null,
    };
    if (!stats.planId && stats.customerLimit === 0) return {
      color: "bg-orange-50 border-orange-200 text-orange-900",
      icon: <CreditCard className="w-5 h-5 text-orange-500 shrink-0" />,
      title: "No active plan — subscribe to go live",
      body: "You can set up your menu and tables, but you won't be able to accept orders until you subscribe.",
      action: { label: "Subscribe Now", onClick: () => navigate("/restaurant/subscription") },
    };
    if (stats.subscriptionStatus === "exhausted") return {
      color: "bg-red-50 border-red-200 text-red-900",
      icon: <XCircle className="w-5 h-5 text-red-500 shrink-0" />,
      title: "Customer limit reached — recharge your plan",
      body: `You've served all ${stats.customerLimit >= 999999 ? "Unlimited" : stats.customerLimit.toLocaleString()} customers on your current plan. Recharge now.`,
      action: { label: "Recharge Plan", onClick: () => navigate("/restaurant/subscription") },
    };
    if (stats.subscriptionStatus === "expired") return {
      color: "bg-red-50 border-red-200 text-red-900",
      icon: <XCircle className="w-5 h-5 text-red-500 shrink-0" />,
      title: "Subscription expired — renew to continue accepting orders",
      body: stats.subscriptionExpiresAt
        ? `Your plan expired on ${new Date(stats.subscriptionExpiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Renew now.`
        : "Your subscription has expired. Renew now to keep accepting orders.",
      action: { label: "Renew Plan", onClick: () => navigate("/restaurant/subscription") },
    };
    if (stats.subscriptionStatus === "suspended") return {
      color: "bg-slate-100 border-slate-300 text-slate-800",
      icon: <AlertCircle className="w-5 h-5 text-slate-500 shrink-0" />,
      title: "Account suspended",
      body: "Your account has been suspended by the admin. Please contact support to resolve this.",
      action: null,
    };
    return null;
  })();

  // ─── Session table label helper ───────────────────────────────────────────────
  // Derives a display label from the table numbers across all orders in a session.
  // Single table  → prefix "Table",  label "T2"
  // Multiple tables → prefix "Tables", label "T2, T6" (sorted, deduplicated)
  // Falls back to session.tableNumber if no per-order table numbers are present.
  const deriveSessionTableLabel = (session: SessionSummary): { prefix: string; label: string } => {
    const tables = [
      ...new Set(
        session.orders
          .map((o) => o.tableNumber)
          .filter((t): t is string => t !== null && t.trim() !== ""),
      ),
    ].sort();
    if (tables.length === 0) {
      return { prefix: "Table", label: session.tableNumber ?? "" };
    }
    return {
      prefix: tables.length > 1 ? "Tables" : "Table",
      label: tables.join(", "),
    };
  };

  // ─── Order card renderer (shared between sessions view and orders list) ──

  const renderOrderCard = (order: Order, i: number) => {
    const cfg        = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.ordered;
    const nextStatus = getNextStatus(order.status);
    const isUpdating = updatingId === order.id;
    const isActive   = ACTIVE_STATUSES.includes(order.status);
    const isUnpaid   = order.paymentStatus !== "paid";
    const isManualReview = order.paymentStatus === "manual_review";
    const isAwaitingVerification = order.paymentStatus === "awaiting_verification";
    const orderError = orderErrors[order.id];
    const isPendingUpiVerification =
      order.status === "awaiting_confirmation" &&
      order.paymentMethod === "upi" &&
      order.paymentStatus !== "paid";
    const utr = isPendingUpiVerification ? extractUtr(order.notes) : null;
    const isVerifying        = verifyingId === order.id;
    const isRejecting        = rejectingId === order.id;

    let ocrData: OcrData | null = null;
    if (order.paymentOcrData) {
      try { ocrData = JSON.parse(order.paymentOcrData) as OcrData; } catch { /* ignore */ }
    }

    const verificationStatus = order.paymentVerificationStatus;
    const isAiVerified      = verificationStatus === "ai_verified";
    const isApproved        = verificationStatus === "approved";
    const isRejectedPayment = verificationStatus === "rejected";

    return (
      <div key={order.id} className={cn("p-4 transition-colors", i % 2 === 0 ? "bg-[#F9FAFB] hover:bg-[#F1F3F5]" : "bg-[#EEF2FF] hover:bg-[#E5EAFC]")}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">

          {/* Left: order info */}
          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-sm">#{order.id}</span>
              {order.tableNumber && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium">Table {order.tableNumber}</span>
              )}
              <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", cfg.color)}>{cfg.label}</span>

              {order.paymentStatus === "paid" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium flex items-center gap-1">
                  {(isAiVerified || isApproved) && <BadgeCheck className="w-3 h-3" />}
                  ✓ Paid
                  {isAiVerified && <span className="text-[10px] text-green-500 ml-0.5">AI</span>}
                </span>
              )}
              {isAwaitingVerification && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-300 font-semibold flex items-center gap-1">
                  <UserCheck className="w-3 h-3" />
                  Awaiting Verification
                </span>
              )}
              {isManualReview && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-300 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Review Required
                </span>
              )}
              {order.paymentStatus === "unpaid" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-300 font-semibold">UNPAID</span>
              )}
              {isRejectedPayment && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">Rejected</span>
              )}
              {order.paymentMethod && (
                <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-muted text-muted-foreground border-border">
                  {order.paymentMethod === "cash"
                    ? "Cash Payment"
                    : order.paymentMethod === "upi" || order.paymentMethod === "razorpay"
                    ? "QR · Online Payment"
                    : order.paymentMethod}
                </span>
              )}
            </div>

            <p className="text-sm font-medium">{order.customerName}</p>
            <p className="text-xs text-muted-foreground">{order.customerPhone}</p>

            <StatusTracker status={order.status} />

            {/* Unpaid warning */}
            {isActive && isUnpaid && !isManualReview && !isPendingUpiVerification && !isAwaitingVerification && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Payment pending — send payment bill to collect
              </div>
            )}

            {/* Error */}
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

            {/* OCR / AI verification panel */}
            {ocrData && (
              <div className={cn(
                "mt-3 rounded-lg border p-3",
                !ocrData.ocrConfigured ? "border-slate-200 bg-slate-50"
                  : isAiVerified        ? "border-green-200 bg-green-50"
                  : "border-amber-200 bg-amber-50",
              )}>
                {!ocrData.ocrConfigured ? (
                  <p className="text-xs text-slate-600 flex items-center gap-1.5">
                    <ScanLine className="w-3.5 h-3.5 shrink-0" />
                    OCR not configured — screenshot saved for manual review
                  </p>
                ) : (
                  <>
                    <p className={cn("text-xs font-semibold flex items-center gap-1.5 mb-2", isAiVerified ? "text-green-800" : "text-amber-800")}>
                      {isAiVerified
                        ? <><BadgeCheck className="w-3.5 h-3.5 shrink-0" />AI Verified Payment</>
                        : <><AlertTriangle className="w-3.5 h-3.5 shrink-0" />Low Confidence — Manual Review</>}
                      <span className="ml-auto font-mono text-[10px]">{ocrData.confidence}% confidence</span>
                    </p>
                    <div className={cn("space-y-1 text-xs", isAiVerified ? "text-green-700" : "text-amber-700")}>
                      {ocrData.utr    && <div className="flex justify-between"><span className="opacity-70">UTR</span><span className="font-mono font-bold">{ocrData.utr}</span></div>}
                      {ocrData.amount !== null && <div className="flex justify-between"><span className="opacity-70">Amount</span><span className="font-bold">₹{ocrData.amount}</span></div>}
                      {ocrData.status && <div className="flex justify-between"><span className="opacity-70">Status</span><span className="font-semibold capitalize">{ocrData.status}</span></div>}
                      {ocrData.merchant && <div className="flex justify-between"><span className="opacity-70">Merchant</span><span>{ocrData.merchant}</span></div>}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Legacy UPI verification panel */}
            {isPendingUpiVerification && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Payment Pending Verification
                </p>
                <div className="space-y-1 text-xs text-amber-700">
                  <div className="flex justify-between"><span className="text-amber-600">Order</span><span className="font-mono font-bold text-amber-900">#{order.id}</span></div>
                  <div className="flex justify-between"><span className="text-amber-600">Amount</span><span className="font-bold text-amber-900">₹{order.total}</span></div>
                  {utr ? (
                    <div className="flex justify-between items-center mt-1 pt-1 border-t border-amber-200">
                      <span className="text-amber-600">UTR</span>
                      <span className="font-mono font-bold tracking-wider text-amber-900 text-sm">{utr}</span>
                    </div>
                  ) : (
                    <div className="mt-1 pt-1 border-t border-amber-200 text-amber-600 italic">No UTR provided</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex flex-row flex-wrap gap-2 sm:flex-col sm:shrink-0 sm:min-w-[148px]">

            {/* Legacy UPI verify/reject */}
            {isPendingUpiVerification && (<>
              <Button size="sm" className="w-full text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => handleVerifyUpi(order.id)} disabled={isVerifying || isRejecting}>
                {isVerifying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                Verify Payment
              </Button>
              <Button size="sm" variant="outline" className="w-full text-xs h-8 text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => handleRejectUpi(order.id)} disabled={isVerifying || isRejecting}>
                {isRejecting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                Reject Payment
              </Button>
            </>)}

            {/* Advance status */}
            {nextStatus && !isPendingUpiVerification && !isManualReview && (
              <Button size="sm" className="w-full text-xs h-8 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => handleStatusUpdate(order.id, nextStatus)} disabled={isUpdating}>
                {isUpdating && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                {nextStatus === "preparing" && "Mark Preparing"}
                {nextStatus === "ready"     && "Mark Ready"}
                {nextStatus === "completed" && "Mark Completed"}
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
  };

  // ─── Table sessions to display (active + awaiting_payment + awaiting_verification, with at least one order) ───
  const displaySessions = sessions.filter(
    (s) =>
      (s.status === "active" || s.status === "awaiting_payment" || s.status === "awaiting_verification") &&
      s.orderCount > 0,
  );

  return (
    <AppShell>

      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Welcome back, {user?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab("live")}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-md font-medium transition-all",
                  activeTab === "live" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Live
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-md font-medium transition-all",
                  activeTab === "history" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                History
              </button>
            </div>
            {activeTab === "live" && (
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                Refresh
              </Button>
            )}
          </div>
        </div>

        {/* History tab */}
        {activeTab === "history" && <HistoryTab />}

        {/* Live tab content */}
        {activeTab === "live" && <>

        {/* Subscription banner */}
        {subBanner && (
          <div className={cn("flex items-start gap-3 border rounded-xl px-5 py-4", subBanner.color)}>
            {subBanner.icon}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{subBanner.title}</p>
              <p className="text-sm mt-0.5 opacity-80">{subBanner.body}</p>
            </div>
            {subBanner.action && (
              <Button size="sm" className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white" onClick={subBanner.action.onClick}>
                {subBanner.action.label}
              </Button>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Today's Orders",  value: stats?.todayOrders ?? 0,        icon: ShoppingBag, color: "text-blue-600" },
            { label: "Today's Revenue", value: `₹${stats?.todayRevenue ?? 0}`, icon: IndianRupee,  color: "text-green-600" },
            { label: "Active Orders",   value: stats?.activeOrders ?? 0,       icon: ChefHat,     color: "text-purple-600" },
            { label: "Pending",         value: stats?.pendingOrders ?? 0,      icon: Clock,       color: "text-orange-600" },
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

        {/* UPI Status badge */}
        {stats?.upiVerified && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm w-fit">
            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
            <span className="font-medium text-green-700">UPI Status:</span>
            <span className="text-green-700">Verified ✓</span>
            {stats.verifiedAt && (
              <span className="text-[11px] text-green-500 ml-1">
                {new Date(stats.verifiedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        )}


        {/* ── Table Sessions (active + awaiting payment) ─────────────────── */}
        {loading ? null : displaySessions.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-orange-500 shrink-0" />
              <h2 className="text-base font-semibold">Table Sessions</h2>
              <span className="ml-2 text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-semibold">
                {displaySessions.length} {displaySessions.length === 1 ? "table" : "tables"}
              </span>
            </div>
            <div className="divide-y divide-border">
              {displaySessions.map((session) => {
                const isExpanded = expandedSessions.has(session.id);
                const hasUnpaidOrders = session.orders.some(
                  (o) => ACTIVE_STATUSES.includes(o.status) && o.paymentStatus !== "paid",
                );
                const activeOrderCount = session.orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
                // Orders that must be completed before Generate Bill can proceed
                const incompleteForBilling = session.orders.filter(
                  (o) => o.status !== "cancelled" && o.status !== "payment_failed" && o.status !== "completed",
                );
                const showBillBlockedBadge =
                  session.status === "active" && !session.bill && incompleteForBilling.length > 0;

                return (
                  <div key={session.id}>
                    {/* Session header: click left area to expand, Generate Bill on right */}
                    <div className="flex items-stretch w-full hover:bg-muted/30 transition-colors">
                      <button
                        className="flex-1 p-4 flex items-center gap-3 text-left min-w-0"
                        onClick={() =>
                          setExpandedSessions((prev) => {
                            const next = new Set(prev);
                            if (next.has(session.id)) next.delete(session.id);
                            else next.add(session.id);
                            return next;
                          })
                        }
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                          session.sessionType === "takeaway" ? "bg-blue-100" : "bg-orange-100",
                        )}>
                          {session.sessionType === "takeaway"
                            ? <ShoppingBag className="w-5 h-5 text-blue-600" />
                            : <UtensilsCrossed className="w-5 h-5 text-orange-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            {session.sessionType === "takeaway" ? (
                              <span className="font-bold text-sm">Takeaway</span>
                            ) : (
                              <span className="font-bold text-sm">
                                {(() => {
                                  const { prefix, label } = deriveSessionTableLabel(session);
                                  return `${prefix} ${label}`;
                                })()}
                              </span>
                            )}
                            {session.sessionType === "takeaway" && session.customerPhone && (
                              <span className="text-xs text-muted-foreground font-mono">+{session.customerPhone}</span>
                            )}
                            {session.status === "active" && (
                              <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                                Active
                              </span>
                            )}
                            {session.status === "awaiting_payment" && (
                              <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                                Awaiting Payment
                              </span>
                            )}
                            {session.status === "awaiting_verification" && (
                              <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                <Camera className="w-3 h-3" />
                                Screenshot Received
                              </span>
                            )}
                            {hasUnpaidOrders && session.status === "active" && (
                              <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                                Unpaid
                              </span>
                            )}
                            {activeOrderCount > 0 && (
                              <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                                {activeOrderCount} in-progress
                              </span>
                            )}
                            {newOrderSessionIds.has(session.id) && (
                              <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                                NEW
                              </span>
                            )}
                            {showBillBlockedBadge && (
                              <span
                                role="button"
                                tabIndex={0}
                                className="text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 hover:bg-amber-200 transition-colors cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIncompleteOrdersModal({ sessionId: session.id, orders: incompleteForBilling });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    setIncompleteOrdersModal({ sessionId: session.id, orders: incompleteForBilling });
                                  }
                                }}
                              >
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {incompleteForBilling.length} order{incompleteForBilling.length !== 1 ? "s" : ""} to complete
                              </span>
                            )}
                            {session.bill && session.bill.status === "generated" && (
                              <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                                Bill Ready
                              </span>
                            )}
                            {session.bill && session.bill.status === "sent" && (
                              <span className="text-xs bg-sky-100 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                <Send className="w-3 h-3" />
                                Bill Sent
                              </span>
                            )}
                            {session.bill && session.bill.hasScreenshot && session.bill.status !== "paid" && (
                              <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                <Camera className="w-3 h-3" />
                                Proof Received
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span>{session.orderCount} {session.orderCount === 1 ? "order" : "orders"}</span>
                            <span>·</span>
                            <span>{session.itemCount} {session.itemCount === 1 ? "item" : "items"}</span>
                            <span>·</span>
                            {session.bill ? (
                              <>
                                <span className="font-semibold text-foreground">₹{session.bill.total}</span>
                                <span>·</span>
                                <span className="font-mono text-[10px]">{session.bill.billNumber}</span>
                                <span>·</span>
                                <span>
                                  {new Date(session.bill.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-semibold text-foreground">₹{session.totalAmount}</span>
                                <span>·</span>
                                <span>
                                  Since {new Date(session.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-muted-foreground ml-2">
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </button>

                      {/* Right-side action panel */}
                      <div className="flex items-center gap-2 px-4 shrink-0 border-l border-border/50">

                        {/* Generate Bill — only for active sessions without a bill */}
                        {session.status === "active" && !session.bill && (
                          <Button
                            size="sm"
                            className="h-8 text-xs whitespace-nowrap"
                            onClick={() => handleGenerateBill(session.id)}
                            disabled={generatingBillId === session.id}
                          >
                            {generatingBillId === session.id
                              ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                              : <Receipt className="w-3 h-3 mr-1.5" />}
                            Generate Bill
                          </Button>
                        )}

                        {/* View Bill — always shown once a bill exists */}
                        {session.bill && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs whitespace-nowrap"
                            onClick={() => setViewingBillSessionId(session.id)}
                          >
                            <Eye className="w-3 h-3 mr-1.5" />
                            View Bill
                          </Button>
                        )}

                        {/* Send Bill — bill is generated; Resend after already sent */}
                        {session.bill && (session.bill.status === "generated" || session.bill.status === "sent") && (
                          <Button
                            size="sm"
                            className="h-8 text-xs whitespace-nowrap bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => void handleSendSessionBill(session.id)}
                            disabled={sendingBillSessionId === session.id}
                          >
                            {sendingBillSessionId === session.id
                              ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                              : <Send className="w-3 h-3 mr-1.5" />}
                            {session.bill.status === "sent" ? "Resend Bill" : "Send Bill"}
                          </Button>
                        )}

                        {/* Verify Payment — screenshot received, awaiting staff review */}
                        {session.bill?.status === "awaiting_verification" && (
                          <Button
                            size="sm"
                            className="h-8 text-xs whitespace-nowrap bg-violet-600 hover:bg-violet-700 text-white"
                            onClick={() => void loadSessionScreenshot(session.id)}
                            disabled={loadingScreenshotSessionId === session.id}
                          >
                            {loadingScreenshotSessionId === session.id
                              ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                              : <ShieldCheck className="w-3 h-3 mr-1.5" />}
                            Verify Payment
                          </Button>
                        )}

                        {/* Mark Paid — cash / manual payment confirmation */}
                        {session.bill && (
                          session.bill.status === "generated" ||
                          session.bill.status === "sent" ||
                          session.bill.status === "awaiting_verification"
                        ) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs whitespace-nowrap text-green-700 border-green-300 hover:bg-green-50"
                            onClick={() => void handleMarkSessionPaid(session.id)}
                            disabled={markingPaidSessionId === session.id}
                          >
                            {markingPaidSessionId === session.id
                              ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                              : <CheckCircle2 className="w-3 h-3 mr-1.5" />}
                            Mark Paid
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded order list — payment actions handled at session level above */}
                    {isExpanded && (
                      <div className="border-t border-border">
                        {session.orders.length === 0 ? (
                          <div className="py-6 text-center text-xs text-muted-foreground">No orders in this session</div>
                        ) : (
                          <div className="divide-y divide-border">
                            {session.orders.map((order, i) => renderOrderCard(order as Order, i))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Orders ─────────────────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <div className="shrink-0">
              <h2 className="text-base font-semibold">Orders</h2>
            </div>
            <div className="flex gap-1 flex-wrap">
              {["active", "completed", "cancelled", "all"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full font-medium capitalize transition-all whitespace-nowrap",
                    filter === f ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80",
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
              {filteredOrders.map((order, i) => renderOrderCard(order, i))}
            </div>
          )}
        </div>

        </>}
      </div>

      {/* ── Session Bill Payment Proof Modal ─────────────────────────── */}
      {(() => {
        const activeSession = viewingScreenshotSessionId !== null
          ? sessions.find((s) => s.id === viewingScreenshotSessionId) ?? null
          : null;
        const activeBill = activeSession?.bill ?? null;
        const sessionScreenshotSrc = viewingScreenshotSessionId !== null
          ? sessionScreenshots.get(viewingScreenshotSessionId)
          : undefined;

        return (
          <Dialog
            open={viewingScreenshotSessionId !== null}
            onOpenChange={(open) => { if (!open) setViewingScreenshotSessionId(null); }}
          >
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-violet-600" />
                  Payment Proof — {activeSession ? (() => { const { prefix, label } = deriveSessionTableLabel(activeSession); return `${prefix} ${label}`; })() : ""}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Bill summary */}
                {activeBill && (
                  <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bill</span>
                      <span className="font-mono font-bold">{activeBill.billNumber}</span>
                    </div>
                    {activeBill.customerPhone && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Customer Phone</span>
                        <span className="font-medium">{activeBill.customerPhone}</span>
                      </div>
                    )}
                    {activeBill.screenshotReceivedAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Received</span>
                        <span className="font-medium">
                          {new Date(activeBill.screenshotReceivedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {new Date(activeBill.screenshotReceivedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="text-muted-foreground font-semibold">Total</span>
                      <span className="font-bold text-foreground">₹{(activeBill.total / 100).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Phone mismatch warning */}
                {activeBill?.phoneMismatch && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>⚠ Phone Number Mismatch</span>
                    </div>
                    <div className="space-y-1 text-amber-700">
                      <div className="flex justify-between">
                        <span className="text-amber-600">Order Phone</span>
                        <span className="font-semibold font-mono">{activeBill.customerPhone ?? "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-600">Screenshot Sender</span>
                        <span className="font-semibold font-mono">{activeBill.senderPhone ?? "—"}</span>
                      </div>
                    </div>
                    <p className="text-amber-700 leading-snug">
                      Please ask the customer to resend the payment proof from the phone number used to place the order.
                    </p>
                  </div>
                )}

                {/* Screenshot */}
                {sessionScreenshotSrc ? (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted border-b">
                      <p className="text-xs font-semibold text-muted-foreground">Payment Screenshot (via WhatsApp)</p>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1"
                          onClick={() => setSessionBillImageZoomed((z) => !z)}>
                          {sessionBillImageZoomed
                            ? <><ZoomOut className="w-3 h-3" /> Zoom Out</>
                            : <><ZoomIn className="w-3 h-3" /> Zoom In</>}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1"
                          onClick={() => {
                            const win = window.open("", "_blank");
                            if (win) {
                              win.document.write(
                                `<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;justify-content:center"><img src="${sessionScreenshotSrc}" style="max-width:100%;height:auto"></body></html>`,
                              );
                            }
                          }}>
                          <ExternalLink className="w-3 h-3" /> Full Screen
                        </Button>
                      </div>
                    </div>
                    <div className={sessionBillImageZoomed ? "overflow-auto cursor-zoom-out" : "overflow-hidden cursor-zoom-in"}>
                      <img
                        src={sessionScreenshotSrc}
                        alt="Payment screenshot"
                        className="w-full object-contain transition-transform duration-200"
                        style={sessionBillImageZoomed
                          ? { maxHeight: "none", transform: "scale(2)", transformOrigin: "top center", marginBottom: "100%" }
                          : { maxHeight: "320px" }}
                        onClick={() => setSessionBillImageZoomed((z) => !z)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-6 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading screenshot…
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline" size="sm"
                  className="text-red-600 border-red-300 hover:bg-red-50 sm:mr-auto"
                  onClick={() => activeSession && void handleRejectSessionBill(activeSession.id)}
                  disabled={approvingBillSessionId !== null || rejectingBillSessionId !== null}
                >
                  {rejectingBillSessionId === viewingScreenshotSessionId
                    ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Rejecting...</>
                    : <><XCircle className="w-3 h-3 mr-1" /> Reject</>}
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setViewingScreenshotSessionId(null)}
                  disabled={approvingBillSessionId !== null || rejectingBillSessionId !== null}
                >
                  Close
                </Button>
                {!activeBill?.phoneMismatch && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => activeSession && void handleApproveSessionBill(activeSession.id)}
                    disabled={approvingBillSessionId !== null || rejectingBillSessionId !== null}
                  >
                    {approvingBillSessionId === viewingScreenshotSessionId
                      ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Approving...</>
                      : <><CheckCircle2 className="w-3 h-3 mr-1" /> Approve Payment</>}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}


      {/* ── View Bill Modal ────────────────────────────────────────────────── */}
      {(() => {
        const billSession = viewingBillSessionId !== null
          ? sessions.find((s) => s.id === viewingBillSessionId) ?? null
          : null;
        const bill = billSession?.bill ?? null;

        const allItems = (billSession?.orders ?? []).flatMap((o) =>
          (o.items ?? []).map((item) => ({ ...item, orderId: o.id }))
        );

        const statusLabel: Record<string, { label: string; color: string }> = {
          generated:            { label: "Bill Ready",            color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
          sent:                 { label: "Bill Sent",             color: "bg-sky-100 text-sky-700 border-sky-200" },
          awaiting_verification:{ label: "Awaiting Verification", color: "bg-violet-100 text-violet-700 border-violet-200" },
          paid:                 { label: "Paid",                  color: "bg-green-100 text-green-700 border-green-200" },
          cancelled:            { label: "Cancelled",             color: "bg-red-100 text-red-700 border-red-200" },
        };
        const statusInfo = bill ? (statusLabel[bill.status] ?? statusLabel.generated) : null;

        return (
          <Dialog open={!!billSession} onOpenChange={(open) => { if (!open) setViewingBillSessionId(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                  {bill ? `Bill ${bill.billNumber}` : "Bill"}
                </DialogTitle>
              </DialogHeader>

              {billSession && bill && (
                <div className="space-y-4 py-1">

                  {/* Session + status row */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {billSession.sessionType === "takeaway" ? (
                        <span className="flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5" />
                          Takeaway
                          {billSession.customerPhone && (
                            <span className="font-mono text-xs">· +{billSession.customerPhone}</span>
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <UtensilsCrossed className="w-3.5 h-3.5" />
                          {(() => {
                            const { prefix, label } = deriveSessionTableLabel(billSession);
                            return `${prefix} ${label}`;
                          })()}
                        </span>
                      )}
                    </div>
                    {statusInfo && (
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", statusInfo.color)}>
                        {statusInfo.label}
                      </span>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>Generated: {new Date(bill.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                    {bill.sentAt && (
                      <div>Sent: {new Date(bill.sentAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                    )}
                  </div>

                  {/* Itemized list */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="bg-muted/40 px-3 py-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item</span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</span>
                    </div>
                    <div className="divide-y divide-border">
                      {allItems.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-muted-foreground text-center">No items found</div>
                      ) : (
                        allItems.map((item, i) => (
                          <div key={i} className="px-3 py-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={cn(
                                "w-2.5 h-2.5 rounded-sm border shrink-0",
                                item.isVeg ? "border-green-600 bg-green-50" : "border-red-600 bg-red-50"
                              )} />
                              <span className="text-sm truncate">{item.name}</span>
                              {item.quantity > 1 && (
                                <span className="text-xs text-muted-foreground shrink-0">× {item.quantity}</span>
                              )}
                            </div>
                            <span className="text-sm font-medium shrink-0">
                              ₹{(Number(item.unitPrice) * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Subtotals */}
                    <div className="border-t border-border bg-muted/20 divide-y divide-border/60">
                      <div className="px-3 py-1.5 flex justify-between text-xs text-muted-foreground">
                        <span>Subtotal</span>
                        <span>₹{Number(bill.subtotal).toFixed(2)}</span>
                      </div>
                      {Number(bill.tax) > 0 && (
                        <div className="px-3 py-1.5 flex justify-between text-xs text-muted-foreground">
                          <span>Tax</span>
                          <span>₹{Number(bill.tax).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="px-3 py-2 flex justify-between font-semibold text-sm">
                        <span>Total</span>
                        <span>₹{Number(bill.total).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              <DialogFooter>
                <Button size="sm" variant="outline" onClick={() => setViewingBillSessionId(null)}>
                  Close
                </Button>
                {bill && (bill.status === "generated" || bill.status === "sent") && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      setViewingBillSessionId(null);
                      void handleSendSessionBill(billSession!.id);
                    }}
                    disabled={sendingBillSessionId === billSession?.id}
                  >
                    {sendingBillSessionId === billSession?.id
                      ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      : <Send className="w-3 h-3 mr-1.5" />}
                    {bill.status === "sent" ? "Resend Bill" : "Send Bill"}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}


      {/* ── Incomplete Orders Modal ────────────────────────────────────────── */}
      {/* Shown when Generate Bill is clicked before all session orders are completed */}
      <Dialog open={!!incompleteOrdersModal} onOpenChange={(open) => { if (!open) setIncompleteOrdersModal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Cannot Generate Bill
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              All orders in this session must be marked <span className="font-semibold text-foreground">Completed</span> before generating a bill.
            </p>
            {incompleteOrdersModal && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 divide-y divide-amber-200">
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold text-amber-800">Incomplete Orders</p>
                </div>
                {incompleteOrdersModal.orders.map((o) => {
                  const cfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.ordered;
                  return (
                    <div key={o.id} className="px-3 py-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-amber-900">Order #{o.id}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setIncompleteOrdersModal(null)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}