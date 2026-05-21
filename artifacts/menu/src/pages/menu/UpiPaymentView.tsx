import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { generateUPILink } from "./utils";
import type { RestaurantData, OrderType } from "./types";

interface Props {
  orderId: number;
  orderTotal: number;
  restaurant: RestaurantData;
  orderType: OrderType | null;
  manualTableNumber: string;
  countdown: number;
  confirmingPayment: boolean;
  utrNumber: string;
  onUtrChange: (v: string) => void;
  onConfirmPayment: () => void;
  onPlaceAnother: () => void;
}

const C = {
  orange: "#f97316",
  orangeDark: "#c2410c",
  amber50: "#fffbeb",
  amber100: "#fef3c7",
  amber200: "#fde68a",
  amber400: "#fbbf24",
  amber500: "#f59e0b",
  amber600: "#d97706",
  amber700: "#b45309",
  amber800: "#92400e",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  gray700: "#374151",
  gray900: "#111827",
  red500: "#ef4444",
  green50: "#f0fdf4",
  green700: "#15803d",
  white: "#ffffff",
  bg: "#f9fafb",
};

export function UpiPaymentView({
  orderId,
  orderTotal,
  restaurant,
  orderType,
  manualTableNumber,
  countdown,
  confirmingPayment,
  utrNumber,
  onUtrChange,
  onConfirmPayment,
  onPlaceAnother,
}: Props) {
  const [showQr, setShowQr] = useState(false);

  const payeeName = restaurant.upiName || restaurant.name;
  const upiLink = generateUPILink(restaurant.upiId!, payeeName, orderTotal, orderId);

  const isTakeAway = orderType === "take_away";
  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;
  const timedOut = countdown === 0;

  return (
    <div style={{
      minHeight: "100dvh",
      backgroundColor: C.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{ textAlign: "center", maxWidth: "360px", width: "100%" }}>

        {/* Icon */}
        <div style={{
          width: "72px", height: "72px",
          borderRadius: "9999px",
          backgroundColor: C.amber100,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.amber500} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </div>

        <h1 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 4px", color: C.gray900 }}>
          Complete Your Payment
        </h1>
        <p style={{ fontSize: "13px", color: C.gray500, margin: "0 0 2px" }}>
          Complete your UPI payment to confirm your order
        </p>
        <p style={{ fontSize: "11px", color: C.gray400, margin: "0 0 16px" }}>Order #{orderId}</p>

        {/* Location chip */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "6px", marginBottom: "18px",
          fontSize: "13px", color: C.gray500,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isTakeAway
              ? <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>
              : <><path d="M3 11l19-9-9 19-2-8-8-2z"/></>
            }
          </svg>
          {isTakeAway
            ? `Take Away · ${restaurant.name}`
            : `${restaurant.seatingLabel ?? "Table"} ${manualTableNumber} · ${restaurant.name}`}
        </div>

        {/* UPI card */}
        <div style={{
          backgroundColor: C.amber50,
          border: `1px solid ${C.amber200}`,
          borderRadius: "16px",
          padding: "16px",
          marginBottom: "14px",
          textAlign: "left",
        }}>
          <p style={{ fontSize: "14px", fontWeight: 700, color: C.amber800, margin: "0 0 12px" }}>
            Total: ₹{orderTotal.toFixed(2)}
          </p>

          {/* Step 1 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
            <span style={{
              width: "20px", height: "20px", borderRadius: "9999px",
              backgroundColor: C.amber400, color: C.white,
              fontSize: "11px", fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: "1px",
            }}>1</span>
            <p style={{ fontSize: "12px", color: C.amber800, margin: 0 }}>
              Tap the button below to open your UPI app and complete payment
            </p>
          </div>

          <a
            href={upiLink}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: "8px", width: "100%", padding: "14px 0",
              backgroundColor: C.amber500, color: C.white,
              borderRadius: "12px", fontWeight: 700, fontSize: "14px",
              textDecoration: "none",
              boxShadow: "0 2px 8px rgba(245,158,11,0.35)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
            Pay ₹{orderTotal.toFixed(2)} via UPI
          </a>
          <p style={{ fontSize: "11px", color: C.amber600, textAlign: "center", margin: "6px 0 12px" }}>
            Opens GPay, PhonePe, Paytm or any UPI app
          </p>

          {/* Step 2 */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "12px" }}>
            <span style={{
              width: "20px", height: "20px", borderRadius: "9999px",
              backgroundColor: C.amber400, color: C.white,
              fontSize: "11px", fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: "1px",
            }}>2</span>
            <p style={{ fontSize: "12px", color: C.amber800, margin: 0 }}>
              After paying, return here and tap <strong>"I have completed payment"</strong> below
            </p>
          </div>

          {/* UTR field */}
          <div style={{ marginBottom: "10px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: C.amber700, display: "block", marginBottom: "4px" }}>
              UTR / Reference Number <span style={{ fontWeight: 400, color: C.amber600 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={utrNumber}
              onChange={(e) => onUtrChange(e.target.value)}
              placeholder="e.g. 427123456789"
              style={{
                width: "100%",
                height: "40px",
                padding: "0 12px",
                borderRadius: "10px",
                border: `1.5px solid ${C.amber200}`,
                backgroundColor: C.white,
                fontSize: "13px",
                color: C.gray900,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <p style={{ fontSize: "10px", color: C.amber600, margin: "4px 0 0" }}>
              Found in your UPI app payment history — helps restaurant verify faster
            </p>
          </div>

          {/* QR fallback toggle */}
          <button
            onClick={() => setShowQr((v) => !v)}
            style={{
              width: "100%",
              padding: "9px 0",
              borderRadius: "10px",
              border: `1px dashed ${C.amber400}`,
              backgroundColor: "transparent",
              color: C.amber700,
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {showQr ? "Hide QR Code" : "Having trouble? Show QR instead"}
          </button>

          {showQr && (
            <div style={{
              marginTop: "12px",
              padding: "14px",
              backgroundColor: C.white,
              borderRadius: "12px",
              textAlign: "center",
              border: `1px solid ${C.amber200}`,
            }}>
              <p style={{ fontSize: "11px", color: C.amber800, fontWeight: 600, margin: "0 0 10px" }}>
                Scan using another device
              </p>
              <div style={{ display: "inline-block", padding: "8px", backgroundColor: C.white, borderRadius: "8px", border: `1px solid ${C.amber200}` }}>
                <QRCodeSVG
                  value={upiLink}
                  size={140}
                  fgColor={C.gray900}
                  bgColor={C.white}
                  level="M"
                />
              </div>
              <p style={{ fontSize: "10px", color: C.gray500, margin: "8px 0 0" }}>
                Ask a friend or family member to scan this with their phone
              </p>
            </div>
          )}
        </div>

        {/* Countdown */}
        {!timedOut ? (
          <p style={{ fontSize: "12px", color: C.gray400, marginBottom: "18px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            Order expires in {mins}:{secs.toString().padStart(2, "0")}
          </p>
        ) : (
          <p style={{ fontSize: "12px", color: C.red500, fontWeight: 600, marginBottom: "18px" }}>
            Payment time has expired. Please place a new order.
          </p>
        )}

        {/* Confirm button */}
        {!timedOut && (
          <button
            onClick={onConfirmPayment}
            disabled={confirmingPayment}
            style={{
              width: "100%", padding: "14px 0",
              borderRadius: "12px",
              backgroundColor: C.orangeDark,
              color: C.white,
              fontWeight: 700, fontSize: "14px",
              marginBottom: "10px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              opacity: confirmingPayment ? 0.6 : 1,
              cursor: confirmingPayment ? "not-allowed" : "pointer",
              border: "none",
              boxShadow: "0 2px 8px rgba(194,65,12,0.30)",
            }}
          >
            {confirmingPayment ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Confirming…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                I have completed payment
              </>
            )}
          </button>
        )}

        <button
          onClick={onPlaceAnother}
          style={{
            width: "100%", padding: "10px 0",
            borderRadius: "12px", border: "none",
            backgroundColor: "transparent",
            color: C.gray500, fontSize: "13px",
            cursor: "pointer",
          }}
        >
          Place Another Order
        </button>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
