import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, ShoppingCart, Loader2, AlertCircle,
  ShoppingBag, ChevronDown, ChevronUp, QrCode, Upload,
  BadgeCheck, AlertTriangle,
} from "lucide-react";
import { PaymentBillView } from "./menu/PaymentBillView";
import type { UploadStage } from "./menu/PaymentBillView";
import type { RestaurantData, PlacedOrderItem, OrderType } from "./menu/types";
import { lsGet } from "./menu/utils";

const BASE: string = import.meta.env.VITE_API_URL ?? "";
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  isVeg: boolean;
}

interface CustomerOrder {
  id: number;
  restaurantId: number;
  restaurantName: string;
  customerName: string;
  tableNumber: string | null;
  status: string;
  paymentStatus: string;
  paymentVerificationStatus: string | null;
  paymentMethod: string | null;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
  items: OrderItem[];
  restaurantUpiId: string | null;
  restaurantUpiName: string | null;
  restaurantPersonalUpiEnabled: boolean;
  restaurantHasPaymentQr: boolean;
  restaurantExtractedUpiId: string | null;
  restaurantExtractedMerchantName: string | null;
  restaurantSeatingLabel: string | null;
}

interface ProofResult {
  ocrConfigured: boolean;
  matched?: boolean;
  confidence?: number;
  utr?: string | null;
  alreadyHasScreenshot?: boolean;
  error?: string;
}

const C = {
  orange: "#ea580c",
  bg: "#faf9f6",
  card: "#ffffff",
  border: "#ede8e3",
  ink: "#1a0a00",
  muted: "#6b7280",
  mutedBg: "#f5f0eb",
  green: "#16a34a",
  greenBg: "#f0fdf4",
  red: "#dc2626",
  inputBorder: "#d1c9bf",
} as const;

function statusInfo(status: string): { label: string; color: string; bg: string } {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    ordered: { label: "Received", color: "#6b7280", bg: "#f3f4f6" },
    pending: { label: "Pending", color: "#d97706", bg: "#fffbeb" },
    awaiting_confirmation: { label: "Awaiting", color: "#d97706", bg: "#fffbeb" },
    confirmed: { label: "Confirmed", color: "#2563eb", bg: "#eff6ff" },
    preparing: { label: "Preparing", color: "#7c3aed", bg: "#f5f3ff" },
    ready: { label: "Ready!", color: C.green, bg: C.greenBg },
    completed: { label: "Completed", color: C.green, bg: C.greenBg },
    cancelled: { label: "Cancelled", color: "#dc2626", bg: "#fef2f2" },
    payment_failed: { label: "Pay Failed", color: "#dc2626", bg: "#fef2f2" },
    pending_payment: { label: "Pay Pending", color: "#d97706", bg: "#fffbeb" },
  };
  return map[status] ?? { label: status, color: C.muted, bg: C.mutedBg };
}

function paymentBadge(paymentStatus: string, paymentMethod: string | null): string {
  if (paymentStatus === "paid") return "Paid";
  if (paymentMethod === "cash") return "Cash";
  if (paymentStatus === "manual_review") return "Under Review";
  return "Pending";
}

function paymentBadgeStyle(paymentStatus: string): React.CSSProperties {
  if (paymentStatus === "paid") {
    return { color: C.green, backgroundColor: C.greenBg };
  }
  return { color: "#d97706", backgroundColor: "#fffbeb" };
}

interface OrderCardProps {
  order: CustomerOrder;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}

function OrderCard({ order, expanded, onToggle, onRefresh }: OrderCardProps) {
  // ── All hooks before any conditional return ───────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [showBill, setShowBill] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [proofResult, setProofResult] = useState<ProofResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Revoke blob URL once proof result arrives
  useEffect(() => {
    if (proofResult && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [proofResult, previewUrl]);

  // Cleanup on unmount
  useEffect(() => {
    const url = previewUrl;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [previewUrl]);

  // ── Payment recovery conditions ───────────────────────────────────────────
  const canViewPaymentQr = order.paymentMethod === "upi" && order.paymentStatus !== "paid";
  const canUploadScreenshot =
    order.paymentMethod === "upi" &&
    (order.paymentStatus === "awaiting_verification" || order.paymentStatus === "unpaid") &&
    order.paymentVerificationStatus !== "approved";

  const isUploading = uploadStage !== "idle";

  // ── Upload handler (mirrors MenuPage.handleUploadProof exactly) ───────────
  const handleUploadProof = useCallback(async (file: File, forceReplace = false) => {
    setUploadStage("uploading");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setUploadStage("verifying");
      const res = await fetch(
        `${BASE}/api/menu/${order.restaurantId}/orders/${order.id}/payment-proof`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screenshotBase64: base64, mimeType: file.type, forceReplace }),
        },
      );
      if (res.status === 409) {
        setProofResult({ ocrConfigured: false, alreadyHasScreenshot: true });
        return;
      }
      const data = await res.json() as ProofResult;
      setProofResult(data);
      onRefresh();
    } catch {
      setProofResult({ ocrConfigured: false, error: "Upload failed. Please try again." });
    } finally {
      setUploadStage("idle");
    }
  }, [order.restaurantId, order.id, onRefresh]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, forceReplace: boolean) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError("Only JPG and PNG files are accepted.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setFileError("File size must be under 10 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    void handleUploadProof(file, forceReplace);
  };

  // ── Construct RestaurantData for PaymentBillView ───────────────────────────
  const restaurantForBill: RestaurantData = {
    id: order.restaurantId,
    name: order.restaurantName,
    description: null,
    cuisineType: "",
    logoUrl: null,
    address: "",
    city: "",
    phone: "",
    taxPercent: 0,
    upiId: order.restaurantUpiId,
    upiName: order.restaurantUpiName,
    personalUpiEnabled: order.restaurantPersonalUpiEnabled,
    hasPaymentQr: order.restaurantHasPaymentQr,
    extractedUpiId: order.restaurantExtractedUpiId,
    extractedMerchantName: order.restaurantExtractedMerchantName,
    seatingLabel: order.restaurantSeatingLabel,
  };

  const orderItems: PlacedOrderItem[] = order.items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    isVeg: i.isVeg,
  }));

  const inferredOrderType: OrderType = order.tableNumber ? "dine_in" : "take_away";

  // ── Payment bill overlay — rendered after all hooks ───────────────────────
  if (showBill) {
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}>
        <PaymentBillView
          orderId={order.id}
          orderTotal={order.total}
          restaurant={restaurantForBill}
          orderType={inferredOrderType}
          manualTableNumber={order.tableNumber ?? ""}
          customerName={order.customerName}
          orderItems={orderItems}
          uploadStage={uploadStage}
          proofResult={proofResult}
          onUploadProof={handleUploadProof}
          onPrevious={() => { setShowBill(false); onRefresh(); }}
          onNext={() => { setShowBill(false); onRefresh(); }}
          onCashPayment={() => { setShowBill(false); onRefresh(); }}
        />
      </div>
    );
  }

  // ── Normal order card ─────────────────────────────────────────────────────
  const { label: statusText, color: statusColor, bg: statusBg } = statusInfo(order.status);
  const date = new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

  return (
    <div style={{
      backgroundColor: C.card,
      borderRadius: "16px",
      border: `1px solid ${C.border}`,
      overflow: "hidden",
    }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: "8px",
          textAlign: "left",
          backgroundColor: "transparent",
          cursor: "pointer",
          border: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: "14px", color: C.ink }}>{order.restaurantName}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{
              fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px",
              color: statusColor, backgroundColor: statusBg,
            }}>
              {statusText}
            </span>
            {expanded
              ? <ChevronUp style={{ width: "16px", height: "16px", color: C.muted }} />
              : <ChevronDown style={{ width: "16px", height: "16px", color: C.muted }} />
            }
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: C.muted }}>
          <span>Order #{order.id} · {date}</span>
          <span style={{ fontWeight: 700, fontSize: "14px", color: C.ink }}>₹{order.total}</span>
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <span style={{
            fontSize: "11px", padding: "2px 8px", borderRadius: "20px",
            fontWeight: 600,
            ...paymentBadgeStyle(order.paymentStatus),
          }}>
            {paymentBadge(order.paymentStatus, order.paymentMethod)}
          </span>
          {order.paymentMethod && (
            <span style={{
              fontSize: "11px", padding: "2px 8px", borderRadius: "20px",
              color: C.muted, backgroundColor: C.mutedBg,
            }}>
              {order.paymentMethod === "cash" ? "Cash" : order.paymentMethod === "razorpay" ? "QR · Online Payment" : "UPI"}
            </span>
          )}
          {order.tableNumber && (
            <span style={{
              fontSize: "11px", padding: "2px 8px", borderRadius: "20px",
              color: C.muted, backgroundColor: C.mutedBg,
            }}>
              {order.tableNumber}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div style={{
          borderTop: `1px solid ${C.border}`,
          padding: "12px 16px",
          backgroundColor: "#faf9f6",
        }}>

          {/* ── Item list ──────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
            {order.items.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    width: "7px", height: "7px", borderRadius: "2px", flexShrink: 0,
                    backgroundColor: item.isVeg ? C.green : C.red,
                  }} />
                  <span style={{ fontSize: "13px", color: C.ink }}>
                    {item.quantity}× {item.name}
                  </span>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: C.ink }}>
                  ₹{item.unitPrice * item.quantity}
                </span>
              </div>
            ))}
          </div>

          {/* ── Totals ─────────────────────────────────────────── */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.muted }}>
              <span>Subtotal</span>
              <span>₹{order.subtotal}</span>
            </div>
            {order.tax > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.muted }}>
                <span>Tax</span>
                <span>₹{order.tax}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700, color: C.ink, marginTop: "2px" }}>
              <span>Total</span>
              <span>₹{order.total}</span>
            </div>
          </div>

          {/* ── Rejection alert ─────────────────────────────────── */}
          {order.paymentVerificationStatus === "rejected" && (
            <div style={{
              marginTop: "10px",
              backgroundColor: "#fef2f2",
              borderRadius: "8px",
              border: "1px solid #fecaca",
              padding: "10px 12px",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}>
              <AlertCircle style={{ width: "14px", height: "14px", color: C.red, flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: "12px", color: "#b91c1c", lineHeight: "1.5", margin: 0 }}>
                Payment proof could not be verified. Please show payment confirmation to restaurant staff.
              </p>
            </div>
          )}

          {/* ── Payment recovery actions ────────────────────────── */}
          {(canViewPaymentQr || canUploadScreenshot) && (
            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>

              {/* View Payment QR — re-opens PaymentBillView for this order */}
              {canViewPaymentQr && (
                <button
                  type="button"
                  onClick={() => { setProofResult(null); setShowBill(true); }}
                  style={{
                    width: "100%", height: "40px",
                    borderRadius: "10px",
                    border: `1.5px solid ${C.orange}`,
                    backgroundColor: "#fff7ed", color: C.orange,
                    fontWeight: 600, fontSize: "13px",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                    cursor: "pointer",
                  }}
                >
                  <QrCode style={{ width: "15px", height: "15px" }} />
                  View Payment QR
                </button>
              )}

              {/* Upload screenshot — only when not already uploaded this session */}
              {canUploadScreenshot && !proofResult && (
                <>
                  {previewUrl && (
                    <div style={{ borderRadius: "8px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                      <img
                        src={previewUrl}
                        alt="Payment screenshot preview"
                        style={{ width: "100%", height: "auto", maxHeight: "160px", objectFit: "contain", display: "block", backgroundColor: C.mutedBg }}
                      />
                    </div>
                  )}
                  {fileError && (
                    <p style={{ fontSize: "12px", color: C.red, margin: 0 }}>{fileError}</p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    style={{ display: "none" }}
                    onChange={(e) => handleFileChange(e, false)}
                  />
                  <button
                    type="button"
                    onClick={() => { setFileError(null); fileInputRef.current?.click(); }}
                    disabled={isUploading}
                    style={{
                      width: "100%", height: "40px",
                      borderRadius: "10px",
                      border: `1.5px dashed ${isUploading ? "#d1c9bf" : C.orange}`,
                      backgroundColor: isUploading ? "#faf9f6" : "#fff7ed",
                      color: isUploading ? C.muted : C.orange,
                      fontWeight: 600, fontSize: "13px",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      cursor: isUploading ? "not-allowed" : "pointer",
                    }}
                  >
                    {uploadStage === "uploading"
                      ? <><Loader2 style={{ width: "14px", height: "14px" }} /> Uploading...</>
                      : uploadStage === "verifying"
                      ? <><Loader2 style={{ width: "14px", height: "14px" }} /> Verifying...</>
                      : <><Upload style={{ width: "14px", height: "14px" }} /> Upload Payment Screenshot</>}
                  </button>
                </>
              )}

              {/* Screenshot already submitted — offer replace */}
              {proofResult?.alreadyHasScreenshot && (
                <>
                  <div style={{
                    padding: "10px 12px", borderRadius: "8px",
                    backgroundColor: "#fffbeb", border: "1px solid #fde68a",
                    fontSize: "12px", color: "#92400e",
                  }}>
                    Screenshot already submitted. You can replace it below.
                  </div>
                  <input
                    ref={replaceInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    style={{ display: "none" }}
                    onChange={(e) => handleFileChange(e, true)}
                  />
                  <button
                    type="button"
                    onClick={() => { setFileError(null); replaceInputRef.current?.click(); }}
                    disabled={isUploading}
                    style={{
                      width: "100%", height: "40px",
                      borderRadius: "10px",
                      border: `1.5px dashed ${isUploading ? "#d1c9bf" : "#d97706"}`,
                      backgroundColor: isUploading ? "#faf9f6" : "#fffbeb",
                      color: isUploading ? C.muted : "#92400e",
                      fontWeight: 600, fontSize: "13px",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      cursor: isUploading ? "not-allowed" : "pointer",
                    }}
                  >
                    {isUploading
                      ? <><Loader2 style={{ width: "14px", height: "14px" }} /> Uploading...</>
                      : <><Upload style={{ width: "14px", height: "14px" }} /> Replace Screenshot</>}
                  </button>
                </>
              )}

              {/* Upload result */}
              {proofResult && !proofResult.alreadyHasScreenshot && !proofResult.error && (
                <div style={{
                  padding: "10px 12px", borderRadius: "8px",
                  border: `1px solid ${proofResult.matched ? "#bbf7d0" : "#e2e8f0"}`,
                  backgroundColor: proofResult.matched ? "#f0fdf4" : "#f8fafc",
                  display: "flex", alignItems: "flex-start", gap: "8px",
                }}>
                  {proofResult.matched
                    ? <BadgeCheck style={{ width: "15px", height: "15px", color: C.green, flexShrink: 0, marginTop: "1px" }} />
                    : <AlertTriangle style={{ width: "15px", height: "15px", color: "#d97706", flexShrink: 0, marginTop: "1px" }} />}
                  <p style={{ fontSize: "12px", color: proofResult.matched ? "#15803d" : "#92400e", margin: 0, lineHeight: "1.5" }}>
                    {proofResult.matched
                      ? "Payment screenshot uploaded and verified."
                      : "Screenshot uploaded. Staff will verify your payment shortly."}
                  </p>
                </div>
              )}

              {/* Upload error */}
              {proofResult?.error && (
                <div style={{
                  padding: "10px 12px", borderRadius: "8px",
                  backgroundColor: "#fef2f2", border: "1px solid #fecaca",
                  fontSize: "12px", color: C.red,
                }}>
                  {proofResult.error}
                </div>
              )}

            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default function OrderHistoryPage() {
  const [inputPhone, setInputPhone] = useState(() => lsGet("ts_phone") ?? "");
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);

  const fetchOrders = useCallback(async (phone: string) => {
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/menu/customer/orders?phone=${encodeURIComponent(phone.trim())}`);
      const data = await res.json() as CustomerOrder[] | { error: string };
      if (!res.ok) throw new Error((data as { error: string }).error ?? "Failed to fetch orders");
      setOrders(data as CustomerOrder[]);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = lsGet("ts_phone");
    if (saved) {
      fetchOrders(saved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders(inputPhone);
  };

  const handleRefresh = useCallback(() => {
    const phone = lsGet("ts_phone") || inputPhone;
    if (phone) fetchOrders(phone);
  }, [fetchOrders, inputPhone]);

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: C.bg }}>

      {/* ── Sticky header ──────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        backgroundColor: C.card,
        borderBottom: `1px solid ${C.border}`,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
        <div style={{ height: "56px", padding: "0 16px", display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => window.history.back()}
            aria-label="Go back"
            style={{
              width: "36px", height: "36px", borderRadius: "50%",
              backgroundColor: C.mutedBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, border: "none", cursor: "pointer",
            }}
          >
            <ArrowLeft style={{ width: "18px", height: "18px", color: C.muted }} />
          </button>
          <h1 style={{ flex: 1, fontWeight: 700, fontSize: "17px", color: C.ink }}>My Orders</h1>
          <ShoppingCart style={{ width: "20px", height: "20px", color: C.muted }} />
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: "512px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* ── Phone lookup ──────────────────────────────────────── */}
        <div style={{
          backgroundColor: C.card, borderRadius: "16px",
          border: `1px solid ${C.border}`, padding: "16px",
        }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: C.ink, marginBottom: "10px" }}>
            Enter your WhatsApp number to view your orders
          </p>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px" }}>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit number"
              value={inputPhone}
              onChange={(e) => setInputPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              style={{
                flex: 1, height: "40px",
                paddingLeft: "12px", paddingRight: "12px",
                borderRadius: "10px",
                border: `1.5px solid ${C.inputBorder}`,
                backgroundColor: "#fff",
                fontSize: "14px", color: C.ink,
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={loading || inputPhone.length < 10}
              style={{
                height: "40px", padding: "0 16px",
                borderRadius: "10px",
                backgroundColor: inputPhone.length >= 10 ? C.orange : "#d1c9bf",
                color: "#fff",
                fontWeight: 600, fontSize: "13px",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", cursor: inputPhone.length >= 10 ? "pointer" : "not-allowed",
              }}
            >
              {loading ? <Loader2 style={{ width: "16px", height: "16px" }} /> : "Search"}
            </button>
          </form>
        </div>

        {/* ── Loading ───────────────────────────────────────────── */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
            <Loader2 style={{ width: "28px", height: "28px", color: C.orange }} />
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────── */}
        {error && !loading && (
          <div style={{
            backgroundColor: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: "12px", padding: "12px 16px",
            fontSize: "13px", color: C.red,
            display: "flex", alignItems: "center", gap: "8px",
          }}>
            <AlertCircle style={{ width: "16px", height: "16px", flexShrink: 0 }} />
            {error}
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────── */}
        {!loading && searched && orders.length === 0 && !error && (
          <div style={{
            backgroundColor: C.card, borderRadius: "16px",
            border: `1px solid ${C.border}`,
            padding: "40px 16px", textAlign: "center",
          }}>
            <ShoppingBag style={{ width: "40px", height: "40px", color: C.muted, margin: "0 auto 12px" }} />
            <p style={{ fontWeight: 700, fontSize: "15px", color: C.ink, marginBottom: "4px" }}>No orders found</p>
            <p style={{ fontSize: "13px", color: C.muted }}>No orders found for this number.</p>
          </div>
        )}

        {/* ── Order cards ───────────────────────────────────────── */}
        {!loading && orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            expanded={expandedId === order.id}
            onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
            onRefresh={handleRefresh}
          />
        ))}
      </div>
    </div>
  );
}
