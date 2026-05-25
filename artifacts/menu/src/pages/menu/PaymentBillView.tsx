import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, ArrowRight, Loader2, Upload,
  BadgeCheck, AlertTriangle, QrCode,
  UtensilsCrossed, ShoppingBag, ReceiptText,
} from "lucide-react";
import type { RestaurantData, OrderType, PlacedOrderItem } from "./types";

interface ProofResult {
  ocrConfigured: boolean;
  matched?: boolean;
  confidence?: number;
  utr?: string | null;
  amount?: number | null;
  error?: string;
}

interface Props {
  orderId: number;
  orderTotal: number;
  restaurant: RestaurantData;
  orderType: OrderType | null;
  manualTableNumber: string;
  customerName: string;
  orderItems: PlacedOrderItem[];
  uploadingProof: boolean;
  proofResult: ProofResult | null;
  onUploadProof: (file: File) => void;
  onPrevious: () => void;
  onNext: () => void;
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

export function PaymentBillView({
  orderId,
  orderTotal,
  restaurant,
  orderType,
  manualTableNumber,
  customerName,
  orderItems,
  uploadingProof,
  proofResult,
  onUploadProof,
  onPrevious,
  onNext,
}: Props) {
  const isTakeAway = orderType === "take_away";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [qrImageData, setQrImageData] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    fetch(`/api/menu/${restaurant.id}/payment-qr`)
      .then((r) => {
        if (!r.ok) throw new Error("QR not found");
        return r.json() as Promise<{ qrImageData: string }>;
      })
      .then((data) => setQrImageData(data.qrImageData))
      .catch(() => setQrError(true))
      .finally(() => setQrLoading(false));
  }, [restaurant.id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadProof(file);
    e.target.value = "";
  };

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: C.bg }}>

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        backgroundColor: C.card,
        borderBottom: `1px solid ${C.border}`,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
        <div style={{ height: "56px", padding: "0 16px", display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={onPrevious}
            aria-label="Back to menu"
            style={{
              width: "36px", height: "36px", borderRadius: "50%",
              backgroundColor: C.mutedBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, border: "none", cursor: "pointer",
            }}
          >
            <ArrowLeft style={{ width: "18px", height: "18px", color: C.muted }} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontWeight: 700, fontSize: "17px", color: C.ink, lineHeight: 1 }}>Pay & Confirm</h1>
            <p style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>Scan QR to complete your payment</p>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: "5px",
            backgroundColor: C.mutedBg, borderRadius: "9999px",
            padding: "4px 10px", fontSize: "12px", fontWeight: 600, color: C.muted,
          }}>
            <ReceiptText style={{ width: "12px", height: "12px" }} />
            #{orderId}
          </div>
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────── */}
      <div style={{ padding: "16px", paddingBottom: "96px", maxWidth: "512px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* Bill card */}
        <div style={{ backgroundColor: C.card, borderRadius: "16px", border: `1px solid ${C.border}`, overflow: "hidden" }}>

          {/* Restaurant + context */}
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, backgroundColor: "#fffbf5" }}>
            <p style={{ fontWeight: 800, fontSize: "16px", color: C.ink, marginBottom: "3px" }}>{restaurant.name}</p>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: C.muted }}>
              {isTakeAway
                ? <ShoppingBag style={{ width: "12px", height: "12px", flexShrink: 0 }} />
                : <UtensilsCrossed style={{ width: "12px", height: "12px", flexShrink: 0 }} />}
              <span>
                {isTakeAway
                  ? `Take Away · ${customerName}`
                  : `${restaurant.seatingLabel ?? "Table"} ${manualTableNumber} · ${customerName}`}
              </span>
            </div>
          </div>

          {/* Items list */}
          <div style={{ padding: "12px 16px" }}>
            {orderItems.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: i < orderItems.length - 1 ? "8px" : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "2px", flexShrink: 0,
                    backgroundColor: item.isVeg ? C.green : C.red,
                  }} />
                  <span style={{ fontSize: "13px", color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.quantity}× {item.name}
                  </span>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: C.ink, flexShrink: 0 }}>
                  ₹{item.quantity * item.unitPrice}
                </span>
              </div>
            ))}
          </div>

          {/* Amount to pay */}
          <div style={{
            padding: "12px 16px",
            borderTop: `1px solid ${C.border}`,
            backgroundColor: "#fff7ed",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: C.ink }}>Amount to Pay</span>
            <span style={{ fontWeight: 800, fontSize: "24px", color: C.orange }}>₹{orderTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* QR code card */}
        <div style={{
          backgroundColor: C.card, borderRadius: "16px",
          border: `1px solid ${C.border}`, padding: "20px",
          textAlign: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", marginBottom: "16px" }}>
            <QrCode style={{ width: "17px", height: "17px", color: C.orange }} />
            <p style={{ fontWeight: 700, fontSize: "15px", color: C.ink }}>Scan to Pay</p>
          </div>

          {qrLoading ? (
            <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 style={{ width: "32px", height: "32px", color: C.muted }} />
            </div>
          ) : qrError || !qrImageData ? (
            <div style={{
              height: "160px", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "10px",
              backgroundColor: C.mutedBg, borderRadius: "12px",
            }}>
              <QrCode style={{ width: "32px", height: "32px", color: C.muted }} />
              <p style={{ fontSize: "13px", color: C.muted }}>QR code unavailable</p>
              <p style={{ fontSize: "11px", color: C.muted }}>Please ask staff for payment details</p>
            </div>
          ) : (
            <img
              src={qrImageData}
              alt="Payment QR Code"
              style={{
                width: "220px", height: "220px",
                objectFit: "contain",
                borderRadius: "12px",
                border: `1px solid ${C.border}`,
                margin: "0 auto",
                display: "block",
              }}
            />
          )}

          <p style={{ fontSize: "12px", color: C.muted, marginTop: "12px", lineHeight: "1.6" }}>
            Open GPay, PhonePe, Paytm or any UPI app and scan the QR above.
          </p>
        </div>

        {/* Screenshot upload */}
        {!proofResult && (
          <div style={{ backgroundColor: C.card, borderRadius: "16px", border: `1px solid ${C.border}`, padding: "16px" }}>
            <p style={{ fontWeight: 700, fontSize: "13px", color: C.ink, marginBottom: "3px" }}>
              Upload Payment Screenshot
            </p>
            <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px", lineHeight: "1.5" }}>
              After paying, upload your UPI screenshot. Staff will verify if automatic verification is unavailable.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingProof}
              style={{
                width: "100%", height: "44px",
                borderRadius: "10px",
                border: `1.5px dashed ${uploadingProof ? "#d1c9bf" : C.orange}`,
                backgroundColor: uploadingProof ? "#faf9f6" : "#fff7ed",
                color: uploadingProof ? C.muted : C.orange,
                fontWeight: 600, fontSize: "13px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                cursor: uploadingProof ? "not-allowed" : "pointer",
              }}
            >
              {uploadingProof
                ? <><Loader2 style={{ width: "16px", height: "16px" }} /> Verifying…</>
                : <><Upload style={{ width: "16px", height: "16px" }} /> Upload Payment Screenshot</>}
            </button>
          </div>
        )}

        {/* OCR result card */}
        {proofResult && (
          <div style={{
            backgroundColor: C.card,
            borderRadius: "16px",
            border: `1px solid ${proofResult.matched ? "#bbf7d0" : proofResult.ocrConfigured ? "#fed7aa" : "#e2e8f0"}`,
            padding: "16px",
          }}>
            {!proofResult.ocrConfigured ? (
              <>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "4px" }}>
                  Screenshot saved
                </p>
                <p style={{ fontSize: "12px", color: C.muted }}>
                  Automatic verification unavailable — staff will verify your payment manually.
                </p>
              </>
            ) : proofResult.matched ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <BadgeCheck style={{ width: "20px", height: "20px", color: C.green }} />
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#15803d" }}>Payment Verified ✓</span>
                </div>
                {proofResult.utr && (
                  <p style={{ fontSize: "12px", color: "#166534" }}>UTR: {proofResult.utr}</p>
                )}
                <p style={{ fontSize: "11px", color: "#16a34a", marginTop: "2px" }}>
                  AI Confidence: {proofResult.confidence}%
                </p>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <AlertTriangle style={{ width: "16px", height: "16px", color: "#d97706" }} />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#92400e" }}>Manual Review Required</span>
                </div>
                <p style={{ fontSize: "12px", color: "#92400e" }}>
                  Staff will verify your payment shortly.
                  {proofResult.confidence !== undefined && ` (AI confidence: ${proofResult.confidence}%)`}
                </p>
              </>
            )}
          </div>
        )}

      </div>

      {/* ── Fixed bottom navigation ───────────────────────────────── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        backgroundColor: C.card,
        borderTop: `1px solid ${C.border}`,
        padding: "12px 16px",
        paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
        display: "flex", gap: "10px",
      }}>
        <button
          type="button"
          onClick={onPrevious}
          style={{
            flex: 1, height: "50px", borderRadius: "14px",
            border: `2px solid ${C.border}`,
            backgroundColor: C.card, color: C.ink,
            fontWeight: 600, fontSize: "14px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            cursor: "pointer",
          }}
        >
          <ArrowLeft style={{ width: "16px", height: "16px" }} />
          Back to Menu
        </button>
        <button
          type="button"
          onClick={onNext}
          style={{
            flex: 1, height: "50px", borderRadius: "14px",
            backgroundColor: C.orange, color: "#fff",
            border: "none",
            fontWeight: 700, fontSize: "14px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            boxShadow: "0 4px 16px rgba(234,88,12,0.28)",
            cursor: "pointer",
          }}
        >
          Done
          <ArrowRight style={{ width: "16px", height: "16px" }} />
        </button>
      </div>
    </div>
  );
}
