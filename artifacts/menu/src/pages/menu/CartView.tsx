import { ArrowLeft, ShoppingCart, Minus, Plus, ArrowRight } from "lucide-react";
import type { RestaurantData, CartItem, MenuItemData } from "./types";

interface Props {
  cart: CartItem[];
  itemCount: number;
  subtotal: number;
  tax: number;
  total: number;
  restaurant: RestaurantData;
  onAdd: (item: MenuItemData) => void;
  onRemove: (itemId: number) => void;
  onClose: () => void;
  onCheckout: () => void;
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
} as const;

export function CartView({
  cart,
  itemCount,
  subtotal,
  tax,
  total,
  restaurant,
  onAdd,
  onRemove,
  onClose,
  onCheckout,
}: Props) {
  return (
    <div style={{ minHeight: "100dvh", backgroundColor: C.bg }}>

      {/* ── Sticky header ──────────────────────────────────────── */}
      {/*
       * Outer shell absorbs safe-area-inset-top so the header background
       * extends into the notch/punch-hole area on iPhone and Android.
       * The inner row is always 56px so tap targets remain correctly sized.
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
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}>
        <button
          onClick={onClose}
          aria-label="Back to menu"
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
          Your Cart
        </h1>

        <div style={{
          backgroundColor: C.orange, color: "#fff",
          borderRadius: "9999px", fontSize: "12px", fontWeight: 700,
          padding: "3px 11px", flexShrink: 0,
        }}>
          {itemCount} item{itemCount !== 1 ? "s" : ""}
        </div>
      </div>
      </div>{/* end outer sticky wrapper */}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {cart.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          height: "320px", padding: "16px", textAlign: "center",
        }}>
          <ShoppingCart style={{ width: "48px", height: "48px", color: "#d4b08a", marginBottom: "12px" }} />
          <p style={{ color: C.muted, fontWeight: 500, fontSize: "15px" }}>Your cart is empty</p>
          <button
            onClick={onClose}
            style={{ marginTop: "12px", color: C.orange, fontSize: "14px", fontWeight: 600 }}
          >
            Browse Menu
          </button>
        </div>
      ) : (

        /* ── Cart body ────────────────────────────────────────── */
        <div style={{ padding: "16px", paddingBottom: "calc(100px + env(safe-area-inset-bottom, 0px))", maxWidth: "512px", margin: "0 auto" }}>

          {/* Cart items */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
            {cart.map((c) => (
              <div
                key={c.item.id}
                style={{
                  backgroundColor: C.card,
                  borderRadius: "16px",
                  border: `1px solid ${C.border}`,
                  padding: "14px 16px",
                }}
              >
                {/* Row 1: veg indicator + name + unit price */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  {/* Veg / non-veg badge */}
                  <div style={{
                    marginTop: "2px", width: "14px", height: "14px",
                    borderRadius: "3px", flexShrink: 0,
                    border: `2px solid ${c.item.isVeg ? C.green : C.red}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{
                      width: "6px", height: "6px", borderRadius: "50%",
                      backgroundColor: c.item.isVeg ? C.green : C.red,
                    }} />
                  </div>

                  {/* Name */}
                  <p style={{
                    flex: 1, fontWeight: 600, fontSize: "14px",
                    color: C.ink, lineHeight: "1.35",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {c.item.name}
                  </p>

                  {/* Unit price */}
                  <span style={{ fontWeight: 700, fontSize: "14px", color: C.orange, flexShrink: 0 }}>
                    ₹{c.item.price}
                  </span>
                </div>

                {/* Row 2: line total + qty stepper */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginTop: "10px",
                }}>
                  <span style={{ fontSize: "12px", color: C.muted }}>
                    ₹{c.item.price} × {c.quantity} = <strong style={{ color: C.ink }}>₹{c.item.price * c.quantity}</strong>
                  </span>

                  {/* Stepper */}
                  <div style={{
                    display: "flex", alignItems: "center",
                    borderRadius: "9999px",
                    border: `1.5px solid ${C.border}`,
                    overflow: "hidden",
                    backgroundColor: C.mutedBg,
                  }}>
                    <button
                      onClick={() => onRemove(c.item.id)}
                      aria-label="Remove one"
                      style={{
                        width: "36px", height: "36px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: C.muted,
                      }}
                    >
                      <Minus style={{ width: "14px", height: "14px" }} />
                    </button>
                    <span style={{
                      width: "28px", textAlign: "center",
                      fontWeight: 700, fontSize: "15px", color: C.ink,
                    }}>
                      {c.quantity}
                    </span>
                    <button
                      onClick={() => onAdd(c.item)}
                      aria-label="Add one"
                      style={{
                        width: "36px", height: "36px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        backgroundColor: C.orange, color: "#fff",
                      }}
                    >
                      <Plus style={{ width: "14px", height: "14px" }} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bill summary */}
          <div style={{
            backgroundColor: C.card,
            borderRadius: "16px",
            border: `1px solid ${C.border}`,
            overflow: "hidden",
          }}>
            {/* Section label */}
            <div style={{
              padding: "10px 16px 0",
              fontSize: "10px", fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: C.muted,
            }}>
              Bill Summary
            </div>

            <div style={{ padding: "10px 16px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px", color: C.muted }}>
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>

              {tax > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px", color: C.muted }}>
                  <span>GST ({restaurant.taxPercent}%)</span>
                  <span>₹{tax.toFixed(2)}</span>
                </div>
              )}

              <div style={{
                borderTop: `1px solid ${C.border}`,
                paddingTop: "10px", marginTop: "2px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontWeight: 700, fontSize: "15px", color: C.ink }}>Total</span>
                <span style={{ fontWeight: 800, fontSize: "18px", color: C.orange }}>₹{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Fixed checkout CTA ──────────────────────────────────── */}
      {cart.length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          backgroundColor: C.card,
          borderTop: `1px solid ${C.border}`,
          padding: "12px 16px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        }}>
          <div style={{ maxWidth: "512px", margin: "0 auto" }}>
            <button
              onClick={onCheckout}
              style={{
                width: "100%", height: "52px",
                borderRadius: "14px",
                backgroundColor: C.orange, color: "#fff",
                fontWeight: 700, fontSize: "16px",
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: "6px",
                boxShadow: "0 4px 16px rgba(234,88,12,0.30)",
              }}
            >
              Proceed to Checkout
              <span style={{ opacity: 0.85, fontSize: "15px" }}>· ₹{total.toFixed(2)}</span>
              <ArrowRight style={{ width: "18px", height: "18px", marginLeft: "2px" }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
