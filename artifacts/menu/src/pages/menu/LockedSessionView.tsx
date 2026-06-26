import type { SessionLockState } from "./types";

const C = {
  bg: "#faf9f6",
  card: "#ffffff",
  border: "#e5e7eb",
  orange: "#ea580c",
  orangeLight: "#fff7ed",
  orangeBorder: "#fed7aa",
  red: "#dc2626",
  redLight: "#fef2f2",
  redBorder: "#fecaca",
  amber: "#d97706",
  amberLight: "#fffbeb",
  amberBorder: "#fde68a",
  muted: "#6b7280",
  text: "#111827",
  textLight: "#374151",
};

interface LockedSessionViewProps extends SessionLockState {
  onBack: () => void;
  onViewMyOrders?: () => void;
}

export function LockedSessionView({
  lockType,
  billStatus,
  billTotal,
  billNumber,
  onBack,
  onViewMyOrders,
}: LockedSessionViewProps) {
  const isBillLocked = lockType === "bill_locked";

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        padding: "24px",
        gap: "0",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header strip */}
        <div
          style={{
            background: isBillLocked ? C.amberLight : C.redLight,
            borderBottom: `1px solid ${isBillLocked ? C.amberBorder : C.redBorder}`,
            padding: "24px 24px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: isBillLocked ? "#fef3c7" : "#fee2e2",
              border: `2px solid ${isBillLocked ? C.amberBorder : C.redBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isBillLocked ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={C.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="14 2 14 8 20 8" stroke={C.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke={C.amber} strokeWidth="2" strokeLinecap="round"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke={C.amber} strokeWidth="2" strokeLinecap="round"/>
                <polyline points="10 9 9 9 8 9" stroke={C.amber} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>

          {/* Title */}
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: isBillLocked ? C.amber : C.red,
                margin: "0 0 4px",
              }}
            >
              {isBillLocked ? "Bill Generated" : "Table Currently Occupied"}
            </p>
            {isBillLocked && billNumber && (
              <p
                style={{
                  fontSize: "12px",
                  fontFamily: "monospace",
                  color: C.muted,
                  margin: 0,
                  letterSpacing: "0.04em",
                }}
              >
                {billNumber}
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Bill amount (bill_locked only) */}
          {isBillLocked && billTotal !== null && billTotal !== undefined && (
            <div
              style={{
                background: C.orangeLight,
                border: `1px solid ${C.orangeBorder}`,
                borderRadius: "10px",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: "13px", color: C.textLight, fontWeight: 500 }}>Bill Amount</span>
              <span style={{ fontSize: "22px", fontWeight: 800, color: C.orange }}>
                ₹{Number(billTotal).toFixed(2)}
              </span>
            </div>
          )}

          {/* Bill status pill */}
          {isBillLocked && billStatus && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: "100px",
                  background: billStatus === "awaiting_verification" ? "#ede9fe" : "#dbeafe",
                  color: billStatus === "awaiting_verification" ? "#6d28d9" : "#1d4ed8",
                  border: `1px solid ${billStatus === "awaiting_verification" ? "#c4b5fd" : "#93c5fd"}`,
                  letterSpacing: "0.02em",
                  textTransform: "capitalize",
                }}
              >
                {billStatus === "generated"
                  ? "Bill Ready"
                  : billStatus === "sent"
                  ? "Bill Sent"
                  : billStatus === "awaiting_verification"
                  ? "Awaiting Verification"
                  : billStatus}
              </span>
            </div>
          )}

          {/* Explanation */}
          <p
            style={{
              fontSize: "14px",
              color: C.muted,
              lineHeight: 1.6,
              margin: 0,
              textAlign: "center",
            }}
          >
            {isBillLocked
              ? "Ordering is currently locked because a bill has already been generated for this session."
              : "This table already has an active session. Please contact restaurant staff."}
          </p>

          {/* Buttons */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              marginTop: "4px",
            }}
          >
            {isBillLocked && onViewMyOrders && (
              <button
                onClick={onViewMyOrders}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: C.orange,
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <rect x="9" y="3" width="6" height="4" rx="1" ry="1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="9" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="9" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                View My Orders
              </button>
            )}
            <button
              onClick={onBack}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "transparent",
                color: C.muted,
                border: `1px solid ${C.border}`,
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
