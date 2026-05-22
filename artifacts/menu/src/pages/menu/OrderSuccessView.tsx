import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ShoppingBag, UtensilsCrossed, Upload, Loader2, BadgeCheck, AlertTriangle } from "lucide-react";
import type { RestaurantData, OrderType } from "./types";

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
  orderType: OrderType | null;
  restaurant: RestaurantData;
  manualTableNumber: string;
  uploadingProof: boolean;
  proofResult: ProofResult | null;
  onUploadProof: (file: File) => void;
  onRedirectToMenu: () => void;
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
  orderType,
  restaurant,
  manualTableNumber,
  uploadingProof,
  proofResult,
  onUploadProof,
  onRedirectToMenu,
}: Props) {
  const isTakeAway = orderType === "take_away";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onRedirectRef = useRef(onRedirectToMenu);
  const [countdown, setCountdown] = useState(4);

  useEffect(() => { onRedirectRef.current = onRedirectToMenu; });

  // Auto-redirect countdown — pauses while uploading or after proof uploaded
  useEffect(() => {
    if (uploadingProof || proofResult) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          onRedirectRef.current();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [uploadingProof, proofResult]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadProof(file);
    e.target.value = "";
  };

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
            <p style={{ fontSize: "12px", color: "#166534", lineHeight: "1.45" }}>
              Staff will collect payment at your {isTakeAway ? "counter" : "table"}.
            </p>
          </div>
        </div>

        {/* ── Optional payment screenshot ───────────────────────── */}
        {!proofResult && (
          <div style={{
            backgroundColor: C.card,
            borderRadius: "16px",
            border: `1px solid ${C.border}`,
            padding: "16px",
            marginBottom: "14px",
          }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: C.ink, marginBottom: "4px" }}>
              Already paid? (Optional)
            </p>
            <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px", lineHeight: "1.5" }}>
              Upload your UPI payment screenshot for instant verification.
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
                <><Loader2 style={{ width: "16px", height: "16px" }} /> Verifying…</>
              ) : (
                <><Upload style={{ width: "16px", height: "16px" }} /> Upload Payment Screenshot</>
              )}
            </button>
          </div>
        )}

        {/* ── OCR result card ───────────────────────────────────── */}
        {proofResult && (
          <div style={{
            backgroundColor: C.card,
            borderRadius: "16px",
            border: `1px solid ${proofResult.matched ? "#bbf7d0" : proofResult.ocrConfigured ? "#fed7aa" : "#e2e8f0"}`,
            padding: "16px",
            marginBottom: "14px",
          }}>
            {!proofResult.ocrConfigured ? (
              <>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "4px" }}>
                  Screenshot saved
                </p>
                <p style={{ fontSize: "12px", color: C.muted }}>
                  Staff will verify your payment manually.
                </p>
              </>
            ) : proofResult.matched ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <BadgeCheck style={{ width: "20px", height: "20px", color: C.green }} />
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#15803d" }}>
                    Payment Verified ✓
                  </span>
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
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#92400e" }}>
                    Manual Review Required
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "#92400e" }}>
                  Staff will verify your payment shortly.
                  {proofResult.confidence !== undefined && ` (AI confidence: ${proofResult.confidence}%)`}
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Redirect CTA / countdown ──────────────────────────── */}
        <button
          onClick={onRedirectToMenu}
          style={{
            width: "100%", height: "50px",
            borderRadius: "14px",
            backgroundColor: C.orange, color: "#fff",
            fontWeight: 700, fontSize: "15px",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(234,88,12,0.28)",
          }}
        >
          {!uploadingProof && !proofResult && countdown > 0
            ? `Back to Menu (${countdown})`
            : "Back to Menu"}
        </button>

        <p style={{ textAlign: "center", fontSize: "12px", color: C.muted, marginTop: "14px" }}>
          Thank you for ordering from {restaurant.name} 🙏
        </p>
      </div>
    </div>
  );
}
