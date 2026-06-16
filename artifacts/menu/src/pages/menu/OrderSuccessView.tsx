import { useState, useRef } from "react";
import {
  CheckCircle2, ShoppingBag, UtensilsCrossed,
  Upload, Loader2, BadgeCheck, AlertTriangle,
  ArrowLeft, ArrowRight, Banknote, QrCode, RefreshCw,
} from "lucide-react";
import type { RestaurantData, OrderType } from "./types";

export interface ProofResult {
  ocrConfigured: boolean;
  matched?: boolean;
  confidence?: number;
  utr?: string | null;
  amount?: number | null;
  error?: string;
  alreadyHasScreenshot?: boolean;
}

interface Props {
  orderId: number;
  orderTotal: number;
  orderType: OrderType | null;
  restaurant: RestaurantData;
  manualTableNumber: string;
  paymentMode?: "cash" | "online" | null;
  uploadingProof: boolean;
  proofResult: ProofResult | null;
  onUploadProof: (file: File) => void;
  onReplaceProof: (file: File) => void;
  onGoToMenu: () => void;
  onGoToOrders: () => void;
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
  greenBorder: "#bbf7d0",
} as const;

export function OrderSuccessView({
  orderId,
  orderTotal,
  orderType,
  restaurant,
  manualTableNumber,
  paymentMode,
  uploadingProof,
  proofResult,
  onUploadProof,
  onReplaceProof,
  onGoToMenu,
  onGoToOrders,
}: Props) {
  const isTakeAway = orderType === "take_away";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadProof(file);
    e.target.value = "";
  };

  const handleReplaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setShowReplaceConfirm(false);
      onReplaceProof(file);
    }
    e.target.value = "";
  };

  const paymentNote = paymentMode === "online"
    ? "Please scan the restaurant's QR code to complete your payment."
    : `Staff will collect payment at your ${isTakeAway ? "counter" : "table"}.`;

  const PaymentIcon = paymentMode === "online" ? QrCode : Banknote;

  const alreadyHasScreenshot = !!proofResult?.alreadyHasScreenshot;
  const uploadDone = !!proofResult && !alreadyHasScreenshot;

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
            Order Placed!
          </h1>
          <p style={{ fontSize: "14px", color: C.muted, lineHeight: "1.5" }}>
            Your order #{orderId} has been sent to the kitchen.
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

          <div style={{ padding: "14px 16px", backgroundColor: C.greenBg }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#15803d" }}>Total</span>
              <span style={{ fontSize: "18px", fontWeight: 800, color: "#15803d" }}>₹{orderTotal.toFixed(2)}</span>
            </div>

            {/* Payment mode note */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginTop: "2px" }}>
              <PaymentIcon style={{ width: "13px", height: "13px", color: "#166534", flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: "12px", color: "#166534", lineHeight: "1.45", margin: 0 }}>
                {paymentNote}
              </p>
            </div>
          </div>
        </div>

        {/* ── QR payment — no screenshot hint ─────────────────── */}
        {paymentMode === "online" && !proofResult && !uploadingProof && (
          <div style={{
            backgroundColor: "#fffbf5",
            borderRadius: "16px",
            border: "1px solid #fed7aa",
            padding: "14px 16px",
            marginBottom: "14px",
            display: "flex", alignItems: "flex-start", gap: "10px",
          }}>
            <QrCode style={{ width: "16px", height: "16px", color: "#ea580c", flexShrink: 0, marginTop: "2px" }} />
            <div>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "#92400e", marginBottom: "3px" }}>
                Already paid but skipped screenshot upload?
              </p>
              <p style={{ fontSize: "12px", color: "#b45309", lineHeight: "1.5" }}>
                Show your payment confirmation to restaurant staff for manual verification.
              </p>
            </div>
          </div>
        )}

        {/* ── Upload section (only when no result yet) ─────────── */}
        {paymentMode === "online" && !proofResult && (
          <div style={{
            backgroundColor: C.card,
            borderRadius: "16px",
            border: `1px solid ${C.border}`,
            padding: "16px",
            marginBottom: "14px",
          }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: C.ink, marginBottom: "4px" }}>
              Already paid? Upload screenshot (Optional)
            </p>
            <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px", lineHeight: "1.5" }}>
              Upload your UPI payment screenshot so restaurant staff can verify quickly.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            <button
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
              }}
            >
              {uploadingProof ? (
                <><Loader2 style={{ width: "16px", height: "16px" }} /> Uploading…</>
              ) : (
                <><Upload style={{ width: "16px", height: "16px" }} /> Upload Payment Screenshot</>
              )}
            </button>
          </div>
        )}

        {/* ── Already has screenshot (cross-session 409) ───────── */}
        {alreadyHasScreenshot && (
          <div style={{
            backgroundColor: C.card,
            borderRadius: "16px",
            border: `1px solid ${C.border}`,
            padding: "16px",
            marginBottom: "14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <BadgeCheck style={{ width: "18px", height: "18px", color: "#16a34a" }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#15803d" }}>
                Screenshot already submitted.
              </span>
            </div>
            <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px", lineHeight: "1.5" }}>
              Restaurant staff will verify your payment shortly.
            </p>
            {renderReplaceSection()}
          </div>
        )}

        {/* ── Upload result card ────────────────────────────────── */}
        {uploadDone && (
          <div style={{
            backgroundColor: C.card,
            borderRadius: "16px",
            border: `1px solid ${proofResult!.matched ? "#bbf7d0" : proofResult!.ocrConfigured ? "#fed7aa" : "#e2e8f0"}`,
            padding: "16px",
            marginBottom: "14px",
          }}>
            {!proofResult!.ocrConfigured ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <BadgeCheck style={{ width: "18px", height: "18px", color: "#16a34a" }} />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#15803d" }}>
                    Payment screenshot uploaded successfully.
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "#374151", lineHeight: "1.5", marginBottom: "12px" }}>
                  Restaurant staff will verify your payment shortly.
                </p>
                {renderReplaceSection()}
              </>
            ) : proofResult!.matched ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <BadgeCheck style={{ width: "20px", height: "20px", color: C.green }} />
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#15803d" }}>
                    Payment Verified ✓
                  </span>
                </div>
                {proofResult!.utr && (
                  <p style={{ fontSize: "12px", color: "#166534" }}>UTR: {proofResult!.utr}</p>
                )}
                <p style={{ fontSize: "11px", color: "#16a34a", marginTop: "2px" }}>
                  AI Confidence: {proofResult!.confidence}%
                </p>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <AlertTriangle style={{ width: "16px", height: "16px", color: "#d97706" }} />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#92400e" }}>
                    Manual Review Required
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "#92400e", marginBottom: "12px" }}>
                  Staff will verify your payment shortly.
                  {proofResult!.confidence !== undefined && ` (AI confidence: ${proofResult!.confidence}%)`}
                </p>
                {renderReplaceSection()}
              </>
            )}
          </div>
        )}

        {/* ── Previous / Next nav ───────────────────────────────── */}
        <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
          <button
            onClick={onGoToMenu}
            style={{
              flex: 1, height: "50px",
              borderRadius: "14px",
              border: `2px solid ${C.border}`,
              backgroundColor: C.card,
              color: C.ink,
              fontWeight: 600, fontSize: "14px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            }}
          >
            <ArrowLeft style={{ width: "16px", height: "16px" }} />
            Back to Menu
          </button>

          <button
            onClick={onGoToOrders}
            style={{
              flex: 1, height: "50px",
              borderRadius: "14px",
              backgroundColor: C.orange, color: "#fff",
              fontWeight: 700, fontSize: "14px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              boxShadow: "0 4px 16px rgba(234,88,12,0.28)",
            }}
          >
            My Orders
            <ArrowRight style={{ width: "16px", height: "16px" }} />
          </button>
        </div>

        <p style={{ textAlign: "center", fontSize: "12px", color: C.muted, marginTop: "14px" }}>
          Thank you for ordering from {restaurant.name} 🙏
        </p>
      </div>

      {/* Hidden replace file input */}
      <input
        ref={replaceFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleReplaceFileChange}
      />
    </div>
  );

  function renderReplaceSection() {
    if (showReplaceConfirm) {
      return (
        <div style={{
          backgroundColor: "#fff7ed",
          borderRadius: "10px",
          border: "1px solid #fed7aa",
          padding: "12px",
        }}>
          <p style={{ fontSize: "12px", color: "#92400e", marginBottom: "10px", fontWeight: 600 }}>
            This will overwrite the previous upload. Are you sure?
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => replaceFileInputRef.current?.click()}
              style={{
                flex: 1, height: "36px",
                borderRadius: "8px",
                backgroundColor: C.orange, color: "#fff",
                fontWeight: 700, fontSize: "12px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              }}
            >
              <RefreshCw style={{ width: "12px", height: "12px" }} />
              Yes, Replace
            </button>
            <button
              onClick={() => setShowReplaceConfirm(false)}
              style={{
                flex: 1, height: "36px",
                borderRadius: "8px",
                border: `1px solid ${C.border}`,
                backgroundColor: C.card, color: C.muted,
                fontWeight: 600, fontSize: "12px",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <button
        onClick={() => setShowReplaceConfirm(true)}
        style={{
          width: "100%",
          height: "36px",
          borderRadius: "8px",
          border: `1px solid ${C.border}`,
          backgroundColor: "transparent",
          color: C.muted,
          fontWeight: 600, fontSize: "12px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
        }}
      >
        <RefreshCw style={{ width: "12px", height: "12px" }} />
        Replace Screenshot
      </button>
    );
  }
}
