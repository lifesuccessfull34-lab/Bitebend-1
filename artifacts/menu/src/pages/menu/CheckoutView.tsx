import { type FormEvent } from "react";
import {
  ArrowLeft,
  ShoppingBag,
  UtensilsCrossed,
  User,
  Phone,
  Banknote,
  Smartphone,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { RestaurantData, CartItem, OrderType } from "./types";

interface Props {
  restaurant: RestaurantData;
  cart: CartItem[];
  orderType: OrderType | null;
  manualTableNumber: string;
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (phone: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  paymentMethod: "cash" | "upi" | "razorpay" | null;
  onPaymentMethodChange: (m: "cash" | "upi" | "razorpay" | null) => void;
  subtotal: number;
  tax: number;
  total: number;
  placing: boolean;
  placeError: string;
  paymentGridCols: string;
  onSubmit: (e: FormEvent) => void;
  onBack: () => void;
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
  red: "#dc2626",
  inputBorder: "#d1c9bf",
} as const;

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: C.card,
      borderRadius: "16px",
      border: `1px solid ${C.border}`,
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "12px 16px 0",
      fontSize: "10px", fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase" as const,
      color: C.muted,
    }}>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: C.ink, marginBottom: "6px" }}>
      {children}
    </label>
  );
}

export function CheckoutView({
  restaurant,
  cart,
  orderType,
  manualTableNumber,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  notes,
  onNotesChange,
  paymentMethod,
  onPaymentMethodChange,
  subtotal,
  tax,
  total,
  placing,
  placeError,
  onSubmit,
  onBack,
}: Props) {
  const inputStyle: React.CSSProperties = {
    width: "100%", height: "44px",
    paddingLeft: "40px", paddingRight: "12px",
    borderRadius: "10px",
    border: `1.5px solid ${C.inputBorder}`,
    backgroundColor: "#fff",
    fontSize: "14px", color: C.ink,
    outline: "none",
    boxSizing: "border-box",
  };

  const payMethodBtn = (active: boolean, accent: string = C.orange): React.CSSProperties => ({
    display: "flex", flexDirection: "column",
    alignItems: "center", gap: "6px",
    padding: "12px 8px",
    borderRadius: "12px",
    border: `2px solid ${active ? accent : C.border}`,
    backgroundColor: active ? `${accent}0f` : "#fff",
    color: active ? accent : C.muted,
    transition: "border-color 0.15s, background-color 0.15s",
    cursor: "pointer",
  });

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: C.bg }}>

      {/* ── Sticky header ──────────────────────────────────────── */}
      {/*
       * Outer shell absorbs safe-area-inset-top. Inner row stays 56 px so
       * tap targets are always correctly sized below the notch/status bar.
       */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        backgroundColor: C.card,
        borderBottom: `1px solid ${C.border}`,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
      <div style={{
        height: "56px",
        padding: "0 16px",
        display: "flex", alignItems: "center", gap: "12px",
      }}>
        <button
          onClick={onBack}
          aria-label="Back to cart"
          style={{
            width: "36px", height: "36px", borderRadius: "50%",
            backgroundColor: C.mutedBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <ArrowLeft style={{ width: "18px", height: "18px", color: C.muted }} />
        </button>

        <h1 style={{ flex: 1, fontWeight: 700, fontSize: "17px", color: C.ink }}>
          Your Details
        </h1>

        {/* Order type badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: "5px",
          backgroundColor: C.mutedBg,
          borderRadius: "9999px",
          padding: "4px 10px",
          fontSize: "12px", fontWeight: 600, color: C.muted,
          flexShrink: 0,
        }}>
          {orderType === "take_away" ? (
            <>
              <ShoppingBag style={{ width: "12px", height: "12px" }} />
              Take Away
            </>
          ) : (
            <>
              <UtensilsCrossed style={{ width: "12px", height: "12px" }} />
              {restaurant.seatingLabel} {manualTableNumber}
            </>
          )}
        </div>
      </div>
      </div>{/* end outer sticky wrapper */}

      <form onSubmit={onSubmit} style={{ padding: "16px", paddingBottom: "24px", maxWidth: "512px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* ── Contact Info ──────────────────────────────────────── */}
        <SectionCard>
          <SectionLabel>Contact Info</SectionLabel>
          <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* Name */}
            <div>
              <FieldLabel>Your Name *</FieldLabel>
              <div style={{ position: "relative" }}>
                <User style={{
                  position: "absolute", left: "12px", top: "50%",
                  transform: "translateY(-50%)",
                  width: "16px", height: "16px", color: C.muted,
                }} />
                <input
                  style={inputStyle}
                  placeholder="Rahul Sharma"
                  value={customerName}
                  onChange={(e) => onCustomerNameChange(e.target.value)}
                  required
                  autoFocus={!customerName}
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <FieldLabel>WhatsApp Number *</FieldLabel>
              <div style={{ position: "relative" }}>
                <Phone style={{
                  position: "absolute", left: "12px", top: "50%",
                  transform: "translateY(-50%)",
                  width: "16px", height: "16px", color: C.muted,
                }} />
                <input
                  style={inputStyle}
                  placeholder="10-digit number"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={customerPhone}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                    onCustomerPhoneChange(v);
                  }}
                  required
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <FieldLabel>Special Requests <span style={{ fontWeight: 400, color: C.muted }}>(optional)</span></FieldLabel>
              <textarea
                style={{
                  width: "100%", padding: "10px 12px",
                  borderRadius: "10px",
                  border: `1.5px solid ${C.inputBorder}`,
                  backgroundColor: "#fff",
                  fontSize: "14px", color: C.ink,
                  outline: "none", resize: "none",
                  boxSizing: "border-box",
                  lineHeight: "1.5",
                }}
                placeholder="No onions, extra spicy, allergies…"
                rows={2}
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── Order Summary ─────────────────────────────────────── */}
        <SectionCard>
          <SectionLabel>Order Summary</SectionLabel>
          <div style={{ padding: "10px 16px 16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
              {cart.map((c) => (
                <div key={c.item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: "8px", height: "8px", borderRadius: "2px", flexShrink: 0,
                      backgroundColor: c.item.isVeg ? C.green : C.red,
                    }} />
                    <span style={{ fontSize: "13px", color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.quantity}× {c.item.name}
                    </span>
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: C.ink, flexShrink: 0 }}>
                    ₹{c.item.price * c.quantity}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: C.muted }}>
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              {tax > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: C.muted }}>
                  <span>Tax ({restaurant.taxPercent}%)</span>
                  <span>₹{tax.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2px" }}>
                <span style={{ fontWeight: 700, fontSize: "15px", color: C.ink }}>Total</span>
                <span style={{ fontWeight: 800, fontSize: "17px", color: C.orange }}>₹{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── Payment Method ────────────────────────────────────── */}
        <SectionCard>
          <SectionLabel>Payment Method</SectionLabel>
          <div style={{ padding: "10px 16px 16px" }}>

            {/* Payment options */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
              {/* Cash */}
              <button
                type="button"
                onClick={() => onPaymentMethodChange("cash")}
                style={{ ...payMethodBtn(paymentMethod === "cash"), flex: 1 }}
              >
                <Banknote style={{ width: "20px", height: "20px" }} />
                <span style={{ fontSize: "12px", fontWeight: 600 }}>Cash</span>
              </button>

              {/* UPI / QR — shown when QR is uploaded or when personal UPI deep-link is enabled */}
              {(restaurant.hasPaymentQr || (restaurant.upiId && restaurant.personalUpiEnabled)) && (
                <button
                  type="button"
                  onClick={() => onPaymentMethodChange("upi")}
                  style={{ ...payMethodBtn(paymentMethod === "upi"), flex: 1 }}
                >
                  <Smartphone style={{ width: "20px", height: "20px" }} />
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>UPI</span>
                </button>
              )}

              {/* Razorpay */}
              {restaurant.razorpayKeyId && (
                <button
                  type="button"
                  onClick={() => onPaymentMethodChange("razorpay")}
                  style={{ ...payMethodBtn(paymentMethod === "razorpay", "#2563eb"), flex: 1 }}
                >
                  <svg style={{ width: "20px", height: "20px" }} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.97 5.23 13.19 20H9.22l3.34-5.77L6.03 4h4.05l3.43 6.27 3.05-5.04h5.41z" />
                  </svg>
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>Online</span>
                </button>
              )}
            </div>

            {/* Context hints */}
            {paymentMethod === "cash" && (
              <p style={{ fontSize: "12px", color: C.muted, lineHeight: "1.5" }}>
                {orderType === "take_away"
                  ? "Pay cash at the counter when collecting your order."
                  : "Our staff will collect cash at your table."}
              </p>
            )}

            {paymentMethod === "razorpay" && (
              <div style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "10px 12px" }}>
                <p style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: 600, marginBottom: "2px" }}>Pay securely online</p>
                <p style={{ fontSize: "12px", color: "#3b82f6", lineHeight: "1.4" }}>
                  Cards, UPI, Netbanking, Wallets — confirmed immediately after payment.
                </p>
              </div>
            )}

            {/* UPI inline button */}
            {paymentMethod === "upi" && (
              <div style={{ backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "10px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {restaurant.upiId ? (
                  <>
                    <button
                      type="submit"
                      disabled={placing}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                        width: "100%", height: "46px",
                        backgroundColor: C.orange, color: "#fff",
                        borderRadius: "10px", fontWeight: 700, fontSize: "14px",
                        opacity: placing ? 0.6 : 1,
                      }}
                    >
                      {placing
                        ? <Loader2 style={{ width: "16px", height: "16px" }} />
                        : <Smartphone style={{ width: "16px", height: "16px" }} />}
                      {placing ? "Placing Order…" : restaurant.hasPaymentQr ? `Scan QR · ₹${total.toFixed(2)}` : `Pay ₹${total.toFixed(2)} via UPI`}
                    </button>
                    <p style={{ fontSize: "11px", color: C.orange, textAlign: "center" }}>
                      {restaurant.hasPaymentQr ? "Show QR — scan with any UPI app" : "Opens GPay, PhonePe, Paytm or any UPI app"}
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: "12px", color: "#92400e" }}>
                      Pay via UPI at the {orderType === "take_away" ? "counter" : "table"} — show your screenshot to staff.
                    </p>
                    <button
                      type="submit"
                      disabled={placing}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                        width: "100%", height: "46px",
                        backgroundColor: C.orange, color: "#fff",
                        borderRadius: "10px", fontWeight: 700, fontSize: "14px",
                        opacity: placing ? 0.6 : 1,
                      }}
                    >
                      {placing
                        ? <Loader2 style={{ width: "16px", height: "16px" }} />
                        : <CheckCircle2 style={{ width: "16px", height: "16px" }} />}
                      {placing ? "Placing Order…" : `Place Order · ₹${total.toFixed(2)}`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Error */}
        {placeError && (
          <div style={{
            backgroundColor: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: "10px", padding: "10px 14px",
            fontSize: "13px", color: C.red,
          }}>
            {placeError}
          </div>
        )}

        {/* ── Primary CTA (cash / razorpay) ─────────────────────── */}
        {paymentMethod !== "upi" && (
          <button
            type="submit"
            disabled={placing}
            style={{
              width: "100%", height: "52px",
              borderRadius: "14px",
              backgroundColor: paymentMethod === "razorpay" ? "#2563eb" : C.orange,
              color: "#fff",
              fontWeight: 700, fontSize: "16px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              opacity: placing ? 0.65 : 1,
              boxShadow: paymentMethod === "razorpay"
                ? "0 4px 16px rgba(37,99,235,0.30)"
                : "0 4px 16px rgba(234,88,12,0.30)",
            }}
          >
            {placing ? (
              <Loader2 style={{ width: "18px", height: "18px" }} />
            ) : (
              <CheckCircle2 style={{ width: "18px", height: "18px" }} />
            )}
            {placing
              ? (paymentMethod === "razorpay" ? "Opening Payment…" : "Placing Order…")
              : (paymentMethod === "razorpay" ? `Pay ₹${total.toFixed(2)} Online` : `Place Order · ₹${total.toFixed(2)}`)}
          </button>
        )}
      </form>
    </div>
  );
}
