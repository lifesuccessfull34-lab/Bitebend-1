import { useState, useEffect } from "react";
import {
  ArrowLeft, ShoppingBag, Loader2, AlertCircle,
  Receipt, ChevronDown, ChevronUp,
} from "lucide-react";
import { lsGet } from "./menu/utils";

const BASE = "";

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
  tableNumber: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
  items: OrderItem[];
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
}

function OrderCard({ order, expanded, onToggle }: OrderCardProps) {
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
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
            {order.items.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    width: "7px", height: "7px", borderRadius: "2px", flexShrink: 0,
                    backgroundColor: item.isVeg ? C.green : "#dc2626",
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

  useEffect(() => {
    const saved = lsGet("ts_phone");
    if (saved) {
      fetchOrders(saved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOrders = async (phone: string) => {
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
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders(inputPhone);
  };

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
              flexShrink: 0,
            }}
          >
            <ArrowLeft style={{ width: "18px", height: "18px", color: C.muted }} />
          </button>
          <h1 style={{ flex: 1, fontWeight: 700, fontSize: "17px", color: C.ink }}>My Orders</h1>
          <Receipt style={{ width: "20px", height: "20px", color: C.muted }} />
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
            fontSize: "13px", color: "#dc2626",
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
          />
        ))}
      </div>
    </div>
  );
}
