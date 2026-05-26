import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft, ArrowRight, Loader2, Upload,
  BadgeCheck, AlertTriangle, QrCode,
  UtensilsCrossed, ShoppingBag, ReceiptText,
  Banknote,
} from "lucide-react";
import type { RestaurantData, OrderType, PlacedOrderItem } from "./types";
import { generateUPILink } from "./utils";

export type UploadStage = "idle" | "uploading" | "verifying";

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
  uploadStage: UploadStage;
  proofResult: ProofResult | null;
  onUploadProof: (file: File) => void;
  onPrevious: () => void;
  onNext: () => void;
  onCashPayment: () => void;
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

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function PaymentBillView({
  orderId,
  orderTotal,
  restaurant,
  orderType,
  manualTableNumber,
  customerName,
  orderItems,
  uploadStage,
  proofResult,
  onUploadProof,
  onPrevious,
  onNext,
  onCashPayment,
}: Props) {
  const isTakeAway = orderType === "take_away";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Revoke blob URL once OCR result arrives (image no longer needed)
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    onUploadProof(file);
  };

  const isUploading = uploadStage !== "idle";

  // ── Dynamic UPI QR ─────────────────────────────────────────────────────────
  // Resolve the active UPI ID: prefer QR-extracted VPA when a payment QR was
  // uploaded; fall back to the manually entered UPI ID.
  const activeUpiId = restaurant.hasPaymentQr
    ? (restaurant.extractedUpiId ?? "").trim()
    : (restaurant.upiId ?? "").trim();
  const activeName = restaurant.hasPaymentQr
    ? (restaurant.extractedMerchantName || restaurant.upiName || restaurant.name)
    : (restaurant.upiName || restaurant.name);

  // Generated deep-link: upi://pay?pa={vpa}&pn={name}&am={amount}&tn=Order-{id}&cu=INR
  // pa = literal VPA (@ must not be encoded), pn/tn = sanitized + %20-encoded,
  // am = Number(total).toFixed(2), tn = "Order-{orderId}" (order reference).
  const upiLink = generateUPILink(activeUpiId, activeName, orderTotal, orderId);
  const upiIdValid = activeUpiId.length > 0
    && activeUpiId.includes("@")
    && !activeUpiId.includes(" ");

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
            <h1 style={{ fontWeight: 700, fontSize: "17px", color: C.ink, lineHeight: 1 }}>Payment Bill</h1>
            <p style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>{restaurant.name}</p>
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

        {/* ── Order summary card ────────────────────────────────── */}
        <div style={{ backgroundColor: C.card, borderRadius: "16px", border: `1px solid ${C.border}`, overflow: "hidden" }}>

          {/* Restaurant + customer header */}
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

          {/* Item list */}
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

          {/* Total row */}
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

        {/* ── Dynamic QR card ───────────────────────────────────── */}
        <div style={{
          backgroundColor: C.card, borderRadius: "16px",
          border: `1px solid ${C.border}`, padding: "20px",
          textAlign: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", marginBottom: "16px" }}>
            <QrCode style={{ width: "17px", height: "17px", color: C.orange }} />
            <p style={{ fontWeight: 700, fontSize: "15px", color: C.ink }}>Scan to Pay</p>
          </div>

          {upiIdValid ? (
            <>
              {/* QR wraps the UPI deep-link: amount + restaurant + order ref pre-filled */}
              <div style={{
                display: "inline-block",
                padding: "12px",
                backgroundColor: "#fff",
                borderRadius: "12px",
                border: `1px solid ${C.border}`,
              }}>
                <QRCodeSVG
                  value={upiLink}
                  size={200}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* Amount confirmation beneath QR */}
              <div style={{
                marginTop: "12px",
                display: "inline-flex", alignItems: "center", gap: "6px",
                backgroundColor: "#fff7ed",
                borderRadius: "9999px",
                padding: "5px 14px",
                border: "1px solid #fed7aa",
              }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#92400e" }}>₹{orderTotal.toFixed(2)}</span>
                <span style={{ fontSize: "12px", color: "#b45309" }}>pre-filled in your UPI app</span>
              </div>

              <p style={{ fontSize: "12px", color: C.muted, marginTop: "10px", lineHeight: "1.6" }}>
                Open GPay, PhonePe, Paytm or any UPI app and scan above.
                <br />
                The payment amount is automatically pre-filled.
              </p>
            </>
          ) : (
            /* No valid UPI ID configured — fallback to counter/cash */
            <div style={{
              padding: "24px 16px", display: "flex", flexDirection: "column",
              alignItems: "center", gap: "12px",
              backgroundColor: C.mutedBg, borderRadius: "12px",
            }}>
              <QrCode style={{ width: "32px", height: "32px", color: C.muted }} />
              <div>
                <p style={{ fontSize: "13px", fontWeight: 700, color: C.ink, marginBottom: "4px" }}>
                  UPI payment not configured
                </p>
                <p style={{ fontSize: "12px", color: C.muted }}>
                  Please ask staff for payment details or pay with cash.
                </p>
              </div>
              <button
                type="button"
                onClick={onCashPayment}
                style={{
                  width: "100%", height: "40px", borderRadius: "10px",
                  border: "none",
                  backgroundColor: C.orange, color: "#fff",
                  fontWeight: 600, fontSize: "13px",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  cursor: "pointer",
                }}
              >
                <Banknote style={{ width: "14px", height: "14px" }} />
                Switch to Cash Payment
              </button>
            </div>
          )}
        </div>

        {/* ── Screenshot upload ─────────────────────────────────── */}
        {!proofResult && (
          <div style={{ backgroundColor: C.card, borderRadius: "16px", border: `1px solid ${C.border}`, padding: "16px" }}>
            <p style={{ fontWeight: 700, fontSize: "13px", color: C.ink, marginBottom: "3px" }}>
              Upload Payment Screenshot
            </p>
            <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px", lineHeight: "1.5" }}>
              After paying, take a screenshot of your UPI success screen and upload it here. JPG or PNG, max 10 MB.
            </p>

            {previewUrl && (
              <div style={{ marginBottom: "10px", borderRadius: "10px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                <img
                  src={previewUrl}
                  alt="Payment screenshot preview"
                  style={{
                    width: "100%", height: "auto", maxHeight: "200px",
                    objectFit: "contain", display: "block",
                    backgroundColor: C.mutedBg,
                  }}
                />
              </div>
            )}

            {fileError && (
              <p style={{ fontSize: "12px", color: C.red, marginBottom: "8px" }}>
                {fileError}
              </p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => { setFileError(null); fileInputRef.current?.click(); }}
              disabled={isUploading}
              style={{
                width: "100%", height: "44px",
                borderRadius: "10px",
                border: `1.5px dashed ${isUploading ? "#d1c9bf" : C.orange}`,
                backgroundColor: isUploading ? "#faf9f6" : "#fff7ed",
                color: isUploading ? C.muted : C.orange,
                fontWeight: 600, fontSize: "13px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                cursor: isUploading ? "not-allowed" : "pointer",
              }}
            >
              {uploadStage === "uploading"
                ? <><Loader2 style={{ width: "16px", height: "16px" }} /> Uploading...</>
                : uploadStage === "verifying"
                ? <><Loader2 style={{ width: "16px", height: "16px" }} /> Verifying payment...</>
                : <><Upload style={{ width: "16px", height: "16px" }} /> Upload Payment Screenshot</>}
            </button>
          </div>
        )}

        {/* ── Upload result card ────────────────────────────────── */}
        {proofResult && (
          <div style={{
            backgroundColor: C.card,
            borderRadius: "16px",
            border: `1px solid ${proofResult.matched ? "#bbf7d0" : proofResult.ocrConfigured ? "#fed7aa" : "#e2e8f0"}`,
            padding: "16px",
          }}>
            {!proofResult.ocrConfigured ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <BadgeCheck style={{ width: "18px", height: "18px", color: "#94a3b8" }} />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>Screenshot Uploaded</span>
                </div>
                <p style={{ fontSize: "12px", color: C.muted }}>
                  Restaurant staff will verify your payment shortly.
                </p>
              </>
            ) : proofResult.matched ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <BadgeCheck style={{ width: "20px", height: "20px", color: C.green }} />
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#15803d" }}>Payment Verified</span>
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
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#92400e" }}>Verification Pending</span>
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
          Previous
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
          Next
          <ArrowRight style={{ width: "16px", height: "16px" }} />
        </button>
      </div>
    </div>
  );
}
