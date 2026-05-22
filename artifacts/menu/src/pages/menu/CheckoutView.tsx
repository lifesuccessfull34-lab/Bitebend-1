import { type FormEvent } from "react";
import {
  ArrowLeft,
  ShoppingBag,
  UtensilsCrossed,
  User,
  Phone,
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
  subtotal: number;
  tax: number;
  total: number;
  placing: boolean;
  placeError: string;
  onSubmit: (e: FormEvent) => void;
  onBack: () => void;
  /** When true, the submit button says "Proceed to Pay via Razorpay" */
  razorpayConfigured?: boolean;
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
  subtotal,
  tax,
  total,
  placing,
  placeError,
  onSubmit,
  onBack,
  razorpayConfigured = false,
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

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: C.bg }}>

      {/* ── Sticky header ──────────────────────────────────────── */}
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
      </div>

      <form onSubmit={onSubmit} style={{ padding: "16px", paddingBottom: "24px", maxWidth: "512px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* ── Contact Info ──────────────────────────────────────── */}
        <SectionCard>
          <SectionLabel>Contact Info</SectionLabel>
          <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>

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

        {/* ── Place Order CTA ────────────────────────────────────── */}
        <button
          type="submit"
          disabled={placing}
          style={{
            width: "100%", height: "52px",
            borderRadius: "14px",
            backgroundColor: C.orange,
            color: "#fff",
            fontWeight: 700, fontSize: "16px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            opacity: placing ? 0.65 : 1,
            boxShadow: "0 4px 16px rgba(234,88,12,0.30)",
          }}
        >
          {placing ? (
            <Loader2 style={{ width: "18px", height: "18px" }} />
          ) : (
            <CheckCircle2 style={{ width: "18px", height: "18px" }} />
          )}
          {placing
            ? "Placing Order…"
            : razorpayConfigured
              ? `Proceed to Pay · ₹${total.toFixed(2)}`
              : `Place Order · ₹${total.toFixed(2)}`
          }
        </button>
      </form>
    </div>
  );
}
