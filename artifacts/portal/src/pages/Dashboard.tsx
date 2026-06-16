import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";
import type { Order, DashboardStats, SessionSummary } from "@/lib/types";
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
  Upload,
  BadgeCheck,
  ScanLine,
  Send,
  UserCheck,
  Eye,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface BillData {
  billUrl: string;
  whatsappUrl: string;
  message: string;
  total: number;
  customerName: string;
  customerPhone: string;
  restaurantName: string;
  tableNumber: string | null;
  deliveryMethod?: "bridge" | "deeplink";
  sent?: boolean;
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
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId]       = useState<number | null>(null);
  const [payingId, setPayingId]           = useState<number | null>(null);
  const [verifyingId, setVerifyingId]     = useState<number | null>(null);
  const [rejectingId, setRejectingId]     = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("active");
  const [orderErrors, setOrderErrors] = useState<Record<number, string>>({});

  // Payment verification state
  const [uploadingProofId, setUploadingProofId]       = useState<number | null>(null);
  const [approvingId, setApprovingId]                 = useState<number | null>(null);
  const [rejectingPaymentId, setRejectingPaymentId]   = useState<number | null>(null);

  // Staff confirm-payment modal state (screenshot viewer + manual verification)
  const [confirmPaymentOrderId, setConfirmPaymentOrderId] = useState<number | null>(null);
  const [modalFullOrder, setModalFullOrder]               = useState<Order | null>(null);
  const [modalOrderLoading, setModalOrderLoading]         = useState(false);
  const [confirmUtr, setConfirmUtr]                       = useState("");
  const [confirmNotes, setConfirmNotes]                   = useState("");
  const [isConfirmingPayment, setIsConfirmingPayment]     = useState(false);
  const [isRejectingFromModal, setIsRejectingFromModal]   = useState(false);

  // Tracks the last WhatsApp tab opened by "Send Bill".
  const waWindowRef = useRef<Window | null>(null);

  // Bill state — server generates the image; we just track loading per order
  const [billLoading, setBillLoading]     = useState<number | null>(null);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const uploadOrderIdRef = useRef<number | null>(null);

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

  const clearError = (id: number) =>
    setOrderErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });

  const handleStatusUpdate = async (orderId: number, status: string) => {
    clearError(orderId);
    setUpdatingId(orderId);
    try {
      await apiFetch(`/owner/orders/${orderId}`, { method: "PUT", body: JSON.stringify({ status }) });
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

  const handleMarkPaid = async (orderId: number) => {
    clearError(orderId);
    setPayingId(orderId);
    try {
      await apiFetch(`/owner/orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({ paymentStatus: "paid", paymentMethod: "upi" }),
      });
      await fetchData();
    } catch (err: unknown) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: err instanceof Error ? err.message : "Failed" }));
    } finally {
      setPayingId(null);
    }
  };

  const handleSendPaymentBill = async (orderId: number) => {
    clearError(orderId);
    setBillLoading(orderId);
    try {
      const data = await apiFetch<BillData>(`/owner/orders/${orderId}/bill`);

      if (data.deliveryMethod === "bridge" && data.sent) {
        toast.success(`Bill sent to ${data.customerName} via WhatsApp ✓`);
      } else {
        if (!data.whatsappUrl) throw new Error("No WhatsApp URL returned");
        if (waWindowRef.current && !waWindowRef.current.closed) {
          waWindowRef.current.close();
        }
        waWindowRef.current = window.open(data.whatsappUrl, "_blank") ?? null;
        toast.success("WhatsApp opened — tap Send to deliver the bill");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unable to send payment bill");
      setOrderErrors((prev) => ({ ...prev, [orderId]: err instanceof Error ? err.message : "Failed to send bill" }));
    } finally {
      setBillLoading(null);
    }
  };

  const handleUploadProof = async (orderId: number, file: File) => {
    clearError(orderId);
    setUploadingProofId(orderId);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await apiFetch(`/owner/orders/${orderId}/verify-payment`, {
        method: "POST",
        body: JSON.stringify({ screenshotBase64: base64, mimeType: file.type }),
      });
      await fetchData();
    } catch (err: unknown) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: err instanceof Error ? err.message : "Failed" }));
    } finally {
      setUploadingProofId(null);
    }
  };

  const handleApprovePayment = async (orderId: number) => {
    clearError(orderId);
    setApprovingId(orderId);
    try {
      await apiFetch(`/owner/orders/${orderId}/approve-payment`, { method: "PATCH" });
      await fetchData();
    } catch (err: unknown) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: err instanceof Error ? err.message : "Failed" }));
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectPayment = async (orderId: number) => {
    clearError(orderId);
    setRejectingPaymentId(orderId);
    try {
      await apiFetch(`/owner/orders/${orderId}/reject-payment`, { method: "PATCH" });
      await fetchData();
    } catch (err: unknown) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: err instanceof Error ? err.message : "Failed" }));
    } finally {
      setRejectingPaymentId(null);
    }
  };

  const [imageZoomed, setImageZoomed] = useState(false);

  const openConfirmPaymentModal = (orderId: number) => {
    setConfirmPaymentOrderId(orderId);
    setModalFullOrder(null);
    setConfirmUtr("");
    setConfirmNotes("");
    setImageZoomed(false);
    setModalOrderLoading(true);
    apiFetch<Order>(`/owner/orders/${orderId}`)
      .then((o) => setModalFullOrder(o))
      .catch(() => { /* fall back to list-state order */ })
      .finally(() => setModalOrderLoading(false));
  };

  const handleConfirmStaffPayment = async () => {
    if (!confirmPaymentOrderId) return;
    setIsConfirmingPayment(true);
    try {
      await apiFetch(`/owner/orders/${confirmPaymentOrderId}/confirm-staff-payment`, {
        method: "POST",
        body: JSON.stringify({ utr: confirmUtr.trim() || undefined, notes: confirmNotes.trim() || undefined }),
      });
      toast.success("Payment confirmed");
      setConfirmPaymentOrderId(null);
      await fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm payment");
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  const handleRejectFromModal = async () => {
    if (!confirmPaymentOrderId) return;
    setIsRejectingFromModal(true);
    try {
      await apiFetch(`/owner/orders/${confirmPaymentOrderId}/reject-payment`, { method: "PATCH" });
      toast.success("Payment rejected");
      setConfirmPaymentOrderId(null);
      await fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reject payment");
    } finally {
      setIsRejectingFromModal(false);
    }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const orderId = uploadOrderIdRef.current;
    if (file && orderId) void handleUploadProof(orderId, file);
    e.target.value = "";
  };

  // Orders in active sessions — excluded from the legacy orders list
  const activeSessionOrderIds = new Set(
    sessions
      .filter((s) => s.status === "active")
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

  const screenshotQueue = orders.filter(
    (o) => o.paymentStatus === "awaiting_verification" && (o.hasScreenshot ?? !!o.paymentScreenshotUrl)
  );

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

  // ─── Order card renderer (shared between sessions view and legacy orders) ─────

  const renderOrderCard = (order: Order, i: number) => {
    const cfg        = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.ordered;
    const nextStatus = getNextStatus(order.status);
    const isUpdating = updatingId === order.id;
    const isPaying   = payingId === order.id;
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
    const isUploadingProof   = uploadingProofId === order.id;
    const isApproving        = approvingId === order.id;
    const isRejectingPayment = rejectingPaymentId === order.id;

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

            {/* Screenshot viewer / manual verify */}
            {isAwaitingVerification && (
              order.paymentScreenshotUrl ? (
                <Button size="sm" className="w-full text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => openConfirmPaymentModal(order.id)}>
                  <Eye className="w-3 h-3 mr-1" />
                  View Screenshot
                </Button>
              ) : (
                <Button size="sm" className="w-full text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => openConfirmPaymentModal(order.id)}>
                  <UserCheck className="w-3 h-3 mr-1" />
                  Verify Payment
                </Button>
              )
            )}

            {/* Approve / Reject for manual_review */}
            {isManualReview && !isPendingUpiVerification && (<>
              <Button size="sm" className="w-full text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => openConfirmPaymentModal(order.id)} disabled={isApproving || isRejectingPayment}>
                {isApproving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                Approve Paid
              </Button>
              <Button size="sm" variant="outline" className="w-full text-xs h-8 text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => handleRejectPayment(order.id)} disabled={isApproving || isRejectingPayment}>
                {isRejectingPayment ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                Reject
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

            {/* Upload screenshot for AI verification */}
            {isActive && isUnpaid && !isManualReview && !isPendingUpiVerification && !isAwaitingVerification && !ocrData && (
              <Button size="sm" variant="outline"
                className="w-full text-xs h-8 text-blue-700 border-blue-300 hover:bg-blue-50"
                disabled={isUploadingProof}
                onClick={() => {
                  uploadOrderIdRef.current = order.id;
                  fileInputRef.current?.click();
                }}>
                {isUploadingProof ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                Upload Screenshot
              </Button>
            )}

            {/* ── SEND PAYMENT BILL (single combined action) ── */}
            <Button
              size="sm"
              className="w-full text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => void handleSendPaymentBill(order.id)}
              disabled={billLoading === order.id}
            >
              {billLoading === order.id
                ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                : <Send className="w-3 h-3 mr-1" />}
              Send Payment Bill
            </Button>

            {/* ── MARK AS PAID ── */}
            {isActive && isUnpaid && !isManualReview && !isPendingUpiVerification && (
              <Button
                size="sm"
                className="w-full text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => handleMarkPaid(order.id)}
                disabled={isPaying}
              >
                {isPaying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                Mark as Paid
              </Button>
            )}

            {/* Cancel */}
            {order.status !== "completed" && order.status !== "cancelled" && (
              <Button size="sm" variant="ghost"
                className="w-full text-xs h-8 text-destructive hover:text-destructive"
                onClick={() => handleStatusUpdate(order.id, "cancelled")} disabled={isUpdating}>
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
  };

  // ─── Active sessions (only those with at least one order) ─────────────────────
  const activeSessions = sessions.filter(
    (s) => s.status === "active" && s.orderCount > 0,
  );

  return (
    <AppShell>
      {/* Hidden file input for screenshot upload */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />

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

        {/* ── Screenshot Verification Queue ─────────────────────────────── */}
        {screenshotQueue.length > 0 && (
          <div className="bg-card rounded-xl border border-blue-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-blue-200 flex items-center gap-2 bg-blue-50">
              <MessageCircle className="w-4 h-4 text-green-600 shrink-0" />
              <h2 className="text-base font-semibold text-blue-900">Screenshot Verification Queue</h2>
              <span className="ml-auto text-xs bg-blue-600 text-white rounded-full px-2 py-0.5 font-semibold">
                {screenshotQueue.length} pending
              </span>
            </div>
            <div className="divide-y divide-blue-100">
              {screenshotQueue.map((order) => {
                const src = order.paymentScreenshotUrl?.startsWith("data:")
                  ? order.paymentScreenshotUrl
                  : `data:image/jpeg;base64,${order.paymentScreenshotUrl}`;
                return (
                  <div key={order.id} className="p-4 flex items-center gap-4 hover:bg-blue-50/50 transition-colors">
                    {/* Thumbnail */}
                    <button
                      className="w-14 h-14 rounded-lg border border-blue-200 overflow-hidden shrink-0 hover:opacity-80 transition-opacity"
                      onClick={() => openConfirmPaymentModal(order.id)}
                      title="Click to view full screenshot"
                    >
                      <img src={src} alt="Payment screenshot" className="w-full h-full object-cover" />
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-bold text-sm">Order #{order.id}</span>
                        {order.tableNumber && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium">Table {order.tableNumber}</span>
                        )}
                        <span className="text-xs flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                          <MessageCircle className="w-3 h-3" />
                          WhatsApp
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">{order.customerName}</p>
                      <p className="text-xs text-muted-foreground">{order.customerPhone}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Received{" "}
                        {new Date(order.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        {" · "}
                        {new Date(order.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        {" · "}
                        <span className="font-semibold text-foreground">₹{order.total}</span>
                      </p>
                    </div>

                    {/* Action */}
                    <Button
                      size="sm"
                      className="shrink-0 text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => openConfirmPaymentModal(order.id)}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Verify
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Active Sessions ────────────────────────────────────────────── */}
        {loading ? null : activeSessions.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-orange-500 shrink-0" />
              <h2 className="text-base font-semibold">Active Sessions</h2>
              <span className="ml-2 text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-semibold">
                {activeSessions.length} {activeSessions.length === 1 ? "table" : "tables"}
              </span>
            </div>
            <div className="divide-y divide-border">
              {activeSessions.map((session) => {
                const isExpanded = expandedSessions.has(session.id);
                const hasUnpaidOrders = session.orders.some(
                  (o) => ACTIVE_STATUSES.includes(o.status) && o.paymentStatus !== "paid",
                );
                const activeOrderCount = session.orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;

                return (
                  <div key={session.id}>
                    {/* Session header row — always visible */}
                    <button
                      className="w-full p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
                      onClick={() =>
                        setExpandedSessions((prev) => {
                          const next = new Set(prev);
                          if (next.has(session.id)) next.delete(session.id);
                          else next.add(session.id);
                          return next;
                        })
                      }
                    >
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                        <UtensilsCrossed className="w-5 h-5 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-bold text-sm">Table {session.tableNumber}</span>
                          <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                            Active
                          </span>
                          {hasUnpaidOrders && (
                            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                              Unpaid
                            </span>
                          )}
                          {activeOrderCount > 0 && (
                            <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                              {activeOrderCount} in-progress
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{session.orderCount} {session.orderCount === 1 ? "order" : "orders"}</span>
                          <span>·</span>
                          <span>{session.itemCount} {session.itemCount === 1 ? "item" : "items"}</span>
                          <span>·</span>
                          <span className="font-semibold text-foreground">₹{session.totalAmount}</span>
                          <span>·</span>
                          <span>
                            Since {new Date(session.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-muted-foreground ml-2">
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4" />
                          : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>

                    {/* Expanded order list */}
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

        {/* ── Individual Orders (legacy / take-away) ────────────────────── */}
        <div className="bg-card rounded-xl border border-border">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-base font-semibold shrink-0">
              {activeSessions.length > 0 ? "Individual Orders" : "Orders"}
            </h2>
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
      </div>

      {/* ── Payment Proof Modal (screenshot viewer + manual verification) ── */}
      {(() => {
        const listOrder = confirmPaymentOrderId !== null
          ? orders.find((o) => o.id === confirmPaymentOrderId) ?? null
          : null;
        const modalOrder = modalFullOrder ?? listOrder;
        const hasScreenshot = !!(modalFullOrder?.paymentScreenshotUrl ?? listOrder?.hasScreenshot);
        const screenshotSrc = modalFullOrder?.paymentScreenshotUrl?.startsWith("data:")
          ? modalFullOrder.paymentScreenshotUrl
          : `data:image/jpeg;base64,${modalFullOrder?.paymentScreenshotUrl}`;

        return (
          <Dialog
            open={confirmPaymentOrderId !== null}
            onOpenChange={(open) => { if (!open) setConfirmPaymentOrderId(null); }}
          >
            <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {hasScreenshot
                    ? <><Eye className="w-5 h-5 text-blue-600" /> Payment Proof</>
                    : <><UserCheck className="w-5 h-5 text-blue-600" /> Verify Payment</>}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">

                {/* Order summary */}
                {modalOrder && (
                  <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Order</span>
                      <span className="font-bold">#{modalOrder.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer</span>
                      <span className="font-medium">{modalOrder.customerName}</span>
                    </div>
                    {modalOrder.tableNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Table</span>
                        <span className="font-medium">{modalOrder.tableNumber}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="text-muted-foreground font-semibold">Amount</span>
                      <span className="font-bold text-foreground">₹{modalOrder.total}</span>
                    </div>
                  </div>
                )}

                {/* Screenshot preview */}
                {hasScreenshot && (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted border-b">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        Payment Screenshot
                        {modalOrderLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm" variant="ghost"
                          className="h-6 px-2 text-xs gap-1"
                          onClick={() => setImageZoomed((z) => !z)}
                        >
                          {imageZoomed
                            ? <><ZoomOut className="w-3 h-3" /> Zoom Out</>
                            : <><ZoomIn className="w-3 h-3" /> Zoom In</>}
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-6 px-2 text-xs gap-1"
                          onClick={() => {
                            const win = window.open("", "_blank");
                            if (win) {
                              win.document.write(
                                `<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;justify-content:center"><img src="${screenshotSrc}" style="max-width:100%;height:auto"></body></html>`,
                              );
                            }
                          }}
                        >
                          <ExternalLink className="w-3 h-3" /> Full Screen
                        </Button>
                      </div>
                    </div>
                    <div className={imageZoomed ? "overflow-auto cursor-zoom-out" : "overflow-hidden cursor-zoom-in"}>
                      <img
                        src={screenshotSrc}
                        alt="Payment screenshot"
                        className="w-full object-contain transition-transform duration-200"
                        style={imageZoomed
                          ? { maxHeight: "none", transform: "scale(2)", transformOrigin: "top center", marginBottom: "100%" }
                          : { maxHeight: "288px" }}
                        onClick={() => setImageZoomed((z) => !z)}
                      />
                    </div>
                  </div>
                )}

                {!hasScreenshot && (
                  <p className="text-sm text-muted-foreground">
                    Customer will show their payment confirmation at the counter. Enter the UTR / reference number if visible, then confirm.
                  </p>
                )}

                {/* UTR + Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-utr" className="text-xs font-semibold">
                    UTR / Reference Number <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="confirm-utr"
                    placeholder="e.g. 428912345678"
                    value={confirmUtr}
                    onChange={(e) => setConfirmUtr(e.target.value)}
                    className="text-sm h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-notes" className="text-xs font-semibold">
                    Notes <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="confirm-notes"
                    placeholder="e.g. Verified via PhonePe"
                    value={confirmNotes}
                    onChange={(e) => setConfirmNotes(e.target.value)}
                    className="text-sm h-9"
                  />
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-300 hover:bg-red-50 sm:mr-auto"
                  onClick={() => void handleRejectFromModal()}
                  disabled={isConfirmingPayment || isRejectingFromModal}
                >
                  {isRejectingFromModal
                    ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Rejecting...</>
                    : <><XCircle className="w-3 h-3 mr-1" /> Reject</>}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmPaymentOrderId(null)}
                  disabled={isConfirmingPayment || isRejectingFromModal}
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => void handleConfirmStaffPayment()}
                  disabled={isConfirmingPayment || isRejectingFromModal}
                >
                  {isConfirmingPayment
                    ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Confirming...</>
                    : <><CheckCircle2 className="w-3 h-3 mr-1" /> Confirm Payment</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </AppShell>
  );
}