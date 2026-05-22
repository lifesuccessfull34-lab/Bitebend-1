import { useEffect, useState, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";
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
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Upload,
  BadgeCheck,
  ScanLine,
  QrCode,
  X,
  Download,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface BillItem {
  name: string;
  quantity: number;
  unitPrice: number;
  isVeg: boolean;
}

interface BillModal {
  orderId: number;
  qrDataUrl: string;
  qrPayload: string;
  whatsappUrl: string;
  message: string;
  total: number;
  customerName: string;
  restaurantName: string;
  tableNumber: string | null;
  items: BillItem[];
}

// ─── Canvas bill image generator ──────────────────────────────────────────────
// Draws the full payment bill with an embedded QR code onto an off-screen canvas
// and returns it as a PNG data-URL. No external PDF library needed.

async function generateBillImage(modal: BillModal): Promise<string> {
  const W = 600;
  const itemsH = modal.items.length * 30;
  const H = 660 + itemsH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // Orange header
  ctx.fillStyle = "#F97316";
  ctx.fillRect(0, 0, W, 86);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(modal.restaurantName, W / 2, 56);

  let y = 120;

  // Title
  ctx.fillStyle = "#111827";
  ctx.font = "bold 22px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Payment Bill", W / 2, y);
  y += 32;

  // Order + customer meta
  ctx.font = "15px Arial, sans-serif";
  ctx.fillStyle = "#6B7280";
  ctx.textAlign = "left";
  ctx.fillText(`Order #${modal.orderId}`, 40, y);
  if (modal.tableNumber) {
    ctx.textAlign = "right";
    ctx.fillText(`Table: ${modal.tableNumber}`, W - 40, y);
  }
  y += 24;
  ctx.textAlign = "left";
  ctx.fillText(`Customer: ${modal.customerName}`, 40, y);
  y += 32;

  // Divider
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke();
  y += 24;

  // Items header
  ctx.font = "bold 15px Arial, sans-serif";
  ctx.fillStyle = "#374151";
  ctx.textAlign = "left";
  ctx.fillText("Items Ordered", 40, y);
  y += 10;

  // Item rows
  for (const item of modal.items) {
    y += 28;
    // veg/non-veg dot
    ctx.beginPath();
    ctx.arc(50, y - 5, 5, 0, Math.PI * 2);
    ctx.fillStyle = item.isVeg ? "#22C55E" : "#EF4444";
    ctx.fill();

    ctx.font = "15px Arial, sans-serif";
    ctx.fillStyle = "#111827";
    ctx.textAlign = "left";
    ctx.fillText(`${item.quantity}× ${item.name}`, 62, y);
    ctx.textAlign = "right";
    ctx.fillText(`₹${item.unitPrice * item.quantity}`, W - 40, y);
  }
  y += 24;

  // Divider
  ctx.strokeStyle = "#E5E7EB";
  ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke();
  y += 32;

  // Total
  ctx.font = "bold 24px Arial, sans-serif";
  ctx.fillStyle = "#F97316";
  ctx.textAlign = "right";
  ctx.fillText(`Total: ₹${modal.total}`, W - 40, y);
  y += 44;

  // QR label
  ctx.font = "bold 17px Arial, sans-serif";
  ctx.fillStyle = "#374151";
  ctx.textAlign = "center";
  ctx.fillText("Scan QR Code to Pay", W / 2, y);
  y += 18;

  // Load and draw QR image (wait for it to be ready)
  const qrImg = new Image();
  qrImg.src = modal.qrDataUrl;
  await new Promise<void>((resolve) => {
    if (qrImg.complete && qrImg.naturalWidth > 0) { resolve(); return; }
    qrImg.onload = () => resolve();
    qrImg.onerror = () => resolve();
  });
  const qrSize = 220;
  const qrX = (W - qrSize) / 2;
  // white border around QR
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(qrX - 10, y - 4, qrSize + 20, qrSize + 20, 12);
  ctx.fill(); ctx.stroke();
  ctx.drawImage(qrImg, qrX, y + 4, qrSize, qrSize);
  y += qrSize + 32;

  // Footer instructions
  ctx.font = "13px Arial, sans-serif";
  ctx.fillStyle = "#6B7280";
  ctx.textAlign = "center";
  ctx.fillText("After payment, reply with your payment screenshot", W / 2, y);
  y += 20;
  ctx.fillText(`Reference: Order#${modal.orderId}`, W / 2, y);
  y += 28;

  // Thank-you strip
  ctx.fillStyle = "#FFF7ED";
  ctx.fillRect(0, H - 44, W, 44);
  ctx.font = "14px Arial, sans-serif";
  ctx.fillStyle = "#EA580C";
  ctx.textAlign = "center";
  ctx.fillText("Thank you for dining with us! 🙏", W / 2, H - 16);

  return canvas.toDataURL("image/png");
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

  // Bill state
  const [billModal, setBillModal]           = useState<BillModal | null>(null);
  const [billLoading, setBillLoading]       = useState<number | null>(null);
  const [downloadingBill, setDownloadingBill] = useState(false);
  // true after a download-fallback share — prompts the user to attach the file manually
  const [billDownloaded, setBillDownloaded] = useState(false);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const uploadOrderIdRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [statsData, ordersData] = await Promise.all([
        apiFetch<DashboardStats>("/owner/stats"),
        apiFetch<Order[]>("/owner/orders"),
      ]);
      setStats(statsData);
      setOrders(ordersData);
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

  // Combined "Send Payment Bill" action: fetches bill data (QR + message) and shows modal
  const handleSendPaymentBill = async (orderId: number) => {
    clearError(orderId);
    setBillLoading(orderId);
    try {
      const data = await apiFetch<BillModal>(`/owner/orders/${orderId}/bill`);
      setBillModal({ ...data, orderId });
    } catch (err: unknown) {
      setOrderErrors((prev) => ({ ...prev, [orderId]: err instanceof Error ? err.message : "Failed to load bill" }));
    } finally {
      setBillLoading(null);
    }
  };

  const handleDownloadBill = async () => {
    if (!billModal) return;
    setDownloadingBill(true);
    try {
      const imgUrl = await generateBillImage(billModal);
      const a = document.createElement("a");
      a.href = imgUrl;
      a.download = `bill-order-${billModal.orderId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloadingBill(false);
    }
  };

  // Shares the actual generated bill PNG — never sends a plain-text WhatsApp message.
  //
  // Path 1 (preferred — mobile & some desktop browsers):
  //   Web Share API with file support → opens the OS share sheet with the bill PNG
  //   already attached. The owner taps WhatsApp and the image goes with a short caption.
  //
  // Path 2 (fallback — browsers without file-share support):
  //   Downloads the bill PNG to the device and sets billDownloaded=true so the modal
  //   shows a clear instruction: "Saved — now open WhatsApp and attach the file."
  //   Never opens WhatsApp with a plain text URL.
  const handleShareBill = async (modal: BillModal) => {
    setBillDownloaded(false);
    setDownloadingBill(true);
    try {
      const imgUrl = await generateBillImage(modal);

      // Convert data-URL → Blob → File for the share API
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      const file = new File([blob], `bill-order-${modal.orderId}.png`, { type: "image/png" });

      // Short caption — the image itself contains all the details
      const caption =
        `Payment Bill — Order #${modal.orderId}\n` +
        `Total: ₹${modal.total}\n` +
        `Scan the QR code to pay.\n` +
        `Reference: Order#${modal.orderId}`;

      // Try Web Share API with file support.
      // canShare() returning true does NOT guarantee success on desktop — browsers may
      // throw if no share targets are registered (e.g. desktop Chrome without apps).
      // Wrap in try/catch so any failure gracefully falls through to the download path.
      if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: `Payment Bill — Order #${modal.orderId}`, text: caption, files: [file] });
          return; // shared successfully — done
        } catch (shareErr) {
          // AbortError = user dismissed the share sheet — don't download, just exit
          if (shareErr instanceof Error && shareErr.name === "AbortError") return;
          // Any other error (NotAllowedError, no share targets, etc.) — fall through to download
        }
      }

      // Fallback: download the bill image and show a clear "attach it manually" prompt
      const a = document.createElement("a");
      a.href = imgUrl;
      a.download = `bill-order-${modal.orderId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setBillDownloaded(true);
    } finally {
      setDownloadingBill(false);
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

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const orderId = uploadOrderIdRef.current;
    if (file && orderId) void handleUploadProof(orderId, file);
    e.target.value = "";
  };

  const filteredOrders = orders.filter((o) => {
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

  return (
    <AppShell>
      {/* Hidden file input for screenshot upload */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />

      {/* ── Bill modal ─────────────────────────────────────────────────────── */}
      {billModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBillModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-orange-500" />
                <span className="font-semibold text-sm">Payment Bill · Order #{billModal.orderId}</span>
              </div>
              <button onClick={() => setBillModal(null)} className="p-1 rounded-full hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Scrollable bill preview */}
            <div className="overflow-y-auto flex-1">
              {/* Bill card */}
              <div className="mx-4 my-4 rounded-xl border border-border overflow-hidden">
                {/* Restaurant header */}
                <div className="bg-orange-500 px-5 py-4 text-center">
                  <p className="text-white font-bold text-lg">{billModal.restaurantName}</p>
                  <p className="text-orange-100 text-xs mt-0.5">Payment Bill</p>
                </div>

                <div className="p-4 space-y-3">
                  {/* Order meta */}
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Order #{billModal.orderId}</span>
                    {billModal.tableNumber && <span>Table: {billModal.tableNumber}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">Customer: <span className="font-medium text-foreground">{billModal.customerName}</span></div>

                  <div className="border-t border-dashed border-border" />

                  {/* Items */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Items Ordered</p>
                    <div className="space-y-1.5">
                      {billModal.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("w-2 h-2 rounded-full shrink-0", item.isVeg ? "bg-green-500" : "bg-red-500")} />
                            <span>{item.quantity}× {item.name}</span>
                          </div>
                          <span className="font-medium">₹{item.unitPrice * item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-dashed border-border" />

                  {/* Total */}
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-base">Total</span>
                    <span className="font-bold text-xl text-orange-600">₹{billModal.total}</span>
                  </div>

                  {/* QR code — embedded image */}
                  <div className="flex flex-col items-center py-4 gap-3">
                    <p className="text-sm font-semibold text-muted-foreground">Scan QR Code to Pay</p>
                    <div className="p-3 bg-white border-2 border-border rounded-xl">
                      <img
                        src={billModal.qrDataUrl}
                        alt="Payment QR Code"
                        className="w-52 h-52"
                        onLoad={() => { /* QR loaded — ready for download */ }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono text-center break-all px-2">
                      {billModal.qrPayload}
                    </p>
                  </div>

                  {/* Instructions */}
                  <div className="bg-orange-50 rounded-lg px-3 py-2.5 text-xs text-orange-800 space-y-1">
                    <p>📸 After payment, share your payment screenshot with us.</p>
                    <p className="font-mono">Reference: Order#{billModal.orderId}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="px-4 pb-4 pt-2 shrink-0 border-t space-y-2">
              {/* Post-download instruction — shown when Web Share API is unavailable */}
              {billDownloaded && (
                <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-xs text-green-800">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-600" />
                  <span>
                    <span className="font-semibold">Bill saved to your device.</span>
                    {" "}Open WhatsApp, start a chat with the customer, tap the attachment icon and send the downloaded bill image.
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-9"
                  onClick={() => void handleShareBill(billModal)}
                  disabled={downloadingBill}
                >
                  {downloadingBill
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    : <MessageCircle className="w-3.5 h-3.5 mr-1.5" />}
                  {billDownloaded ? "Share Again" : "Share Bill"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs h-9 text-orange-600 border-orange-200 hover:bg-orange-50"
                  onClick={() => void handleDownloadBill()}
                  disabled={downloadingBill}
                >
                  {downloadingBill
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    : <Download className="w-3.5 h-3.5 mr-1.5" />}
                  Download
                </Button>
                <Button size="sm" variant="ghost" className="text-xs h-9 px-3" onClick={() => { setBillModal(null); setBillDownloaded(false); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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

        {/* Orders */}
        <div className="bg-card rounded-xl border border-border">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-base font-semibold shrink-0">Orders</h2>
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
              {filteredOrders.map((order, i) => {
                const cfg       = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.ordered;
                const nextStatus = getNextStatus(order.status);
                const isUpdating = updatingId === order.id;
                const isPaying   = payingId === order.id;
                const isActive   = ACTIVE_STATUSES.includes(order.status);
                const isUnpaid   = order.paymentStatus !== "paid";
                const isManualReview = order.paymentStatus === "manual_review";
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
                const isAiVerified   = verificationStatus === "ai_verified";
                const isApproved     = verificationStatus === "approved";
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
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-medium capitalize">
                              {order.paymentMethod === "upi" ? "UPI" : order.paymentMethod}
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-medium">{order.customerName}</p>
                        <p className="text-xs text-muted-foreground">{order.customerPhone}</p>

                        <StatusTracker status={order.status} />

                        {/* Unpaid warning */}
                        {isActive && isUnpaid && !isManualReview && !isPendingUpiVerification && (
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

                        {/* Approve / Reject for manual_review */}
                        {isManualReview && !isPendingUpiVerification && (<>
                          <Button size="sm" className="w-full text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleApprovePayment(order.id)} disabled={isApproving || isRejectingPayment}>
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
                        {isActive && isUnpaid && !isManualReview && !isPendingUpiVerification && !ocrData && (
                          <Button size="sm" variant="outline"
                            className="w-full text-xs h-8 text-blue-700 border-blue-300 hover:bg-blue-50"
                            disabled={isUploadingProof}
                            onClick={() => { uploadOrderIdRef.current = order.id; fileInputRef.current?.click(); }}>
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
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
