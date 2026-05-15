import { CheckCircle2, ShoppingBag, UtensilsCrossed } from "lucide-react";
import type { RestaurantData, OrderType } from "./types";

interface Props {
  orderId: number;
  orderTotal: number;
  paymentMethod: "cash" | "upi" | "razorpay" | null;
  orderType: OrderType | null;
  restaurant: RestaurantData;
  manualTableNumber: string;
  onPlaceAnother: () => void;
}

const C = {
  orange: "#ea580c",
  bg: "#faf9f6",
  card: "#ffffff",
  border: "#ede8e3",
  ink: "#1a0a00",
  muted: "#6b7280",
  green: "#16a34a",
  greenBg: "#f0fdf4",
  greenBorder: "#bbf7d0",
} as const;

export function OrderSuccessView({
  orderId,
  orderTotal,
  paymentMethod,
  orderType,
  restaurant,
  manualTableNumber,
  onPlaceAnother,
}: Props) {
  const isTakeAway = orderType === "take_away";
  const isUpi = paymentMethod === "upi";
  const isRazorpay = paymentMethod === "razorpay";

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: C.bg,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
    }}>
      <div style={{ width: "100%", maxWidth: "360px" }}>

        {/* ── Success icon ──────────────────────────────────────── */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{
            width: "80px", height: "80px",
            borderRadius: "50%",
            backgroundColor: C.greenBg,
            border: `2px solid ${C.greenBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <CheckCircle2 style={{ width: "44px", height: "44px", color: C.green }} />
          </div>

          <h1 style={{ fontSize: "26px", fontWeight: 800, color: C.ink, marginBottom: "6px" }}>
            {isUpi ? "Payment Noted!" : "Order Placed!"}
          </h1>
          <p style={{ fontSize: "14px", color: C.muted, lineHeight: "1.5" }}>
            {isUpi
              ? "Staff will verify your payment and confirm."
              : `Your order #${orderId} is confirmed.`}
          </p>
        </div>

        {/* ── Order meta card ───────────────────────────────────── */}
        <div style={{
          backgroundColor: C.card,
          borderRadius: "16px",
          border: `1px solid ${C.border}`,
          overflow: "hidden",
          marginBottom: "14px",
        }}>
          {/* Order number + location */}
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", color: C.muted }}>Order</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: C.ink }}>#{orderId}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: C.muted }}>
              {isTakeAway ? (
                <ShoppingBag style={{ width: "14px", height: "14px", flexShrink: 0 }} />
              ) : (
                <UtensilsCrossed style={{ width: "14px", height: "14px", flexShrink: 0 }} />
              )}
              <span>
                {isTakeAway
                  ? `Take Away · ${restaurant.name}`
                  : `${restaurant.seatingLabel} ${manualTableNumber} · ${restaurant.name}`}
              </span>
            </div>
          </div>

          {/* Total + payment note */}
          <div style={{ padding: "14px 16px", backgroundColor: C.greenBg }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#15803d" }}>Total Paid</span>
              <span style={{ fontSize: "18px", fontWeight: 800, color: "#15803d" }}>₹{orderTotal.toFixed(2)}</span>
            </div>
            <p style={{ fontSize: "12px", color: "#166534", lineHeight: "1.45" }}>
              {isRazorpay
                ? "✓ Paid online via Razorpay — order confirmed."
                : isUpi
                ? "✓ Payment noted — staff will verify shortly."
                : isTakeAway
                ? "Pay cash at the counter when collecting your order."
                : "Our staff will collect cash at your table."}
            </p>
          </div>
        </div>

        {/* ── CTA ──────────────────────────────────────────────── */}
        <button
          onClick={onPlaceAnother}
          style={{
            width: "100%", height: "50px",
            borderRadius: "14px",
            backgroundColor: C.orange, color: "#fff",
            fontWeight: 700, fontSize: "15px",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(234,88,12,0.28)",
          }}
        >
          Place Another Order
        </button>

        <p style={{ textAlign: "center", fontSize: "12px", color: C.muted, marginTop: "14px" }}>
          Thank you for ordering from {restaurant.name} 🙏
        </p>
      </div>
    </div>
  );
}
