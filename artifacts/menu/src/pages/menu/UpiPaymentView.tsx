import { useState, useRef, useEffect } from "react";
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
  blue50: "#eff6ff",
  blue600: "#2563eb",
  white: "#ffffff",
  bg: "#f9fafb",
};

function isUtrValid(utr: string): boolean {
  return /^[A-Za-z0-9]{8,}$/.test(utr.trim());
}

// ── Browser / OS detection ────────────────────────────────────────────────────

function detectEnv(): { isAndroid: boolean; isInAppBrowser: boolean } {
  const ua = navigator.userAgent;
  return {
    isAndroid: /Android/i.test(ua),
    // WhatsApp, Instagram, Facebook, Line, WeChat in-app browsers all block
    // custom URL schemes — detect them so we skip the window.location.href
    // attempt and jump straight to the app chooser.
    isInAppBrowser: /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger/i.test(ua),
  };
}

// ── Intent URL builder (Android only) ────────────────────────────────────────
// intent://pay?{params}#Intent;scheme=upi;package={pkg};end
// Bypasses Chrome's link-dispatch pipeline and opens a specific app directly.

function makeIntentUrl(upiLink: string, pkg: string): string {
  const params = upiLink.slice("upi://pay?".length);
  return `intent://pay?${params}#Intent;scheme=upi;package=${pkg};end`;
}

const UPI_APPS = [
  {
    id: "gpay",
    label: "Google Pay",
    pkg: "com.google.android.apps.nbu.paisa.user",
    color: "#1a73e8",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#1a73e8" />
        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="sans-serif">G</text>
      </svg>
    ),
  },
  {
    id: "phonepe",
    label: "PhonePe",
    pkg: "com.phonepe.app",
    color: "#5f259f",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#5f259f" />
        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="sans-serif">P</text>
      </svg>
    ),
  },
  {
    id: "paytm",
    label: "Paytm",
    pkg: "net.one97.paytm",
    color: "#002970",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#00baf2" />
        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="8" fontWeight="700" fontFamily="sans-serif">PAY</text>
      </svg>
    ),
  },
];

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
  const [showChooser, setShowChooser] = useState(false);
  const [utrTouched, setUtrTouched] = useState(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qrImageData, setQrImageData] = useState<string | null>(null);
  const [qrDataLoading, setQrDataLoading] = useState(false);

  useEffect(() => {
    if (!restaurant.hasPaymentQr) return;
    setQrDataLoading(true);
    fetch(`/api/menu/${restaurant.id}/payment-qr`)
      .then((r) => r.json())
      .then((data: { qrImageData: string }) => setQrImageData(data.qrImageData))
      .catch(() => {})
      .finally(() => setQrDataLoading(false));
  }, [restaurant.id, restaurant.hasPaymentQr]);

  const payeeName = restaurant.upiName || restaurant.name;
  const upiLink = generateUPILink(restaurant.upiId!, payeeName, orderTotal, orderId);

  // Validate the UPI ID before attempting to launch any app.
  // A valid VPA must be non-empty, contain exactly one @, and have no spaces.
  const upiIdRaw = (restaurant.upiId ?? "").trim();
  const upiIdValid = upiIdRaw.length > 0 && upiIdRaw.includes("@") && !upiIdRaw.includes(" ");

  const isTakeAway = orderType === "take_away";
  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;
  const timedOut = countdown === 0;

  const openUpiApp = () => {
    // Log every individual UPI field + the full generated URL so the exact
    // payload is visible in DevTools when diagnosing payment-app rejections.
    console.log("[UPI FIELD] pa (UPI ID)  :", JSON.stringify(upiIdRaw), "| valid:", upiIdValid);
    console.log("[UPI FIELD] pn (name)    :", JSON.stringify(payeeName));
    console.log("[UPI FIELD] am (amount)  :", Number(orderTotal).toFixed(2));
    console.log("[UPI FIELD] tr           : (omitted — minimal payload)");
    console.log("[UPI FIELD] tn           : (omitted — minimal payload)");
    console.log("[UPI FULL URL]", upiLink);
    console.log("[UPI FULL URL length]", upiLink.length);

    // Abort early — a malformed UPI ID will always cause a "technical glitch"
    // in every payment app. Show the chooser so the user sees the error banner.
    if (!upiIdValid) {
      console.warn("[UPI] invalid UPI ID, aborting launch");
      setShowChooser(true);
      return;
    }

    const { isAndroid, isInAppBrowser } = detectEnv();
    console.log("[UPI] env:", { isAndroid, isInAppBrowser });

    if (isInAppBrowser) {
      // In-app browsers (WhatsApp, Instagram, Facebook) block custom URL
      // schemes at the WebView layer — window.location.href won't work.
      // Skip straight to the chooser which shows intent:// links (Android)
      // or the generic upi:// link (iOS) and a "open in Chrome" prompt.
      console.log("[UPI] in-app browser detected → showing chooser");
      setShowChooser(true);
      return;
    }

    // First attempt: window.location.href dispatches the upi:// intent
    // directly without browser re-encoding. Works on Chrome Android,
    // Samsung Internet, iOS Safari (GPay/PhonePe register the scheme on iOS).
    window.location.href = upiLink;

    // If a UPI app opens, the browser goes to the background and the page
    // becomes hidden. We cancel the fallback timer in that case.
    // If the page stays visible for 1500ms, the app didn't open → show chooser.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        console.log("[UPI] page hidden → UPI app opened successfully");
        cleanup();
      }
    };

    const cleanup = () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    fallbackTimerRef.current = setTimeout(() => {
      console.log("[UPI] 1500ms timeout — app did not open, showing chooser");
      cleanup();
      setShowChooser(true);
    }, 1500);
  };

  const openApp = (href: string, label: string) => {
    console.log(`[UPI] opening ${label}:`, href);
    window.location.href = href;
  };

  const { isAndroid, isInAppBrowser } = detectEnv();

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

        {/* Invalid UPI ID warning — shown when the restaurant hasn't configured
            a valid UPI VPA. Catches "technical glitch" before the app opens. */}
        {!upiIdValid && (
          <div style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "12px",
            padding: "12px 14px",
            marginBottom: "14px",
            textAlign: "left",
            display: "flex",
            gap: "10px",
            alignItems: "flex-start",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.red500} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div>
              <p style={{ fontSize: "13px", fontWeight: 700, color: C.red500, margin: "0 0 2px" }}>
                Restaurant UPI not configured
              </p>
              <p style={{ fontSize: "11px", color: "#b91c1c", margin: 0, lineHeight: "1.5" }}>
                {upiIdRaw.length === 0
                  ? "This restaurant hasn't added a UPI ID yet."
                  : `UPI ID "${upiIdRaw}" looks invalid (must contain @). Please ask staff to pay by cash or card.`}
              </p>
            </div>
          </div>
        )}

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

          {/* Step 1 — scan QR or open in app */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
            <span style={{
              width: "20px", height: "20px", borderRadius: "9999px",
              backgroundColor: C.amber400, color: C.white,
              fontSize: "11px", fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: "1px",
            }}>1</span>
            <p style={{ fontSize: "12px", color: C.amber800, margin: 0 }}>
              {restaurant.hasPaymentQr
                ? "Scan the QR below with GPay, PhonePe, Paytm or any UPI app"
                : showChooser
                  ? "Choose your UPI app to complete payment"
                  : "Tap the button below to open your UPI app and complete payment"}
            </p>
          </div>

          {/* ── QR image (primary) or UPI deep-link ─────────────────────── */}
          {restaurant.hasPaymentQr ? (
            <div style={{ marginBottom: "12px" }}>
              {qrDataLoading ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.amber500} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite", margin: "0 auto", display: "block" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  <p style={{ fontSize: "11px", color: C.amber600, marginTop: "8px" }}>Loading QR…</p>
                </div>
              ) : qrImageData ? (
                <div style={{ textAlign: "center", margin: "0 0 12px" }}>
                  <div style={{ display: "inline-block", padding: "12px", backgroundColor: C.white, borderRadius: "12px", border: `1px solid ${C.amber200}` }}>
                    <img
                      src={qrImageData}
                      alt="Payment QR"
                      style={{ width: "200px", height: "200px", objectFit: "contain", display: "block" }}
                    />
                  </div>
                  {restaurant.qrMerchantName && (
                    <p style={{ fontSize: "11px", color: C.amber600, marginTop: "6px" }}>
                      Pay to: {restaurant.qrMerchantName}
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "10px 12px", marginBottom: "10px" }}>
                  <p style={{ fontSize: "12px", color: "#b91c1c", margin: 0 }}>
                    Could not load QR — ask staff for payment assistance.
                  </p>
                </div>
              )}

              {/* Fallback: open in payment app (only if UPI ID is also configured) */}
              {upiIdValid && (
                <>
                  {!showChooser ? (
                    <>
                      <button
                        onClick={openUpiApp}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          gap: "8px", width: "100%", padding: "11px 0",
                          backgroundColor: "transparent",
                          border: `1.5px solid ${C.amber200}`,
                          borderRadius: "10px", color: C.amber700,
                          fontWeight: 600, fontSize: "12px", cursor: "pointer",
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                          <line x1="12" y1="18" x2="12.01" y2="18"/>
                        </svg>
                        Can&apos;t scan? Open in payment app
                      </button>
                      <p style={{ fontSize: "10px", color: C.amber500, textAlign: "center", margin: "4px 0 0" }}>
                        Opens GPay, PhonePe, Paytm
                      </p>
                    </>
                  ) : (
                    <div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
                        {UPI_APPS.map((app) => {
                          const href = isAndroid && app.id !== "paytm" ? makeIntentUrl(upiLink, app.pkg) : upiLink;
                          return (
                            <button key={app.id} onClick={() => openApp(href, app.label)} style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "10px 14px", backgroundColor: C.white, border: `1.5px solid ${C.amber200}`, borderRadius: "10px", cursor: "pointer", fontSize: "13px", fontWeight: 700, color: C.gray900 }}>
                              {app.icon}
                              {app.label}
                            </button>
                          );
                        })}
                        <button onClick={() => openApp(upiLink, "any UPI app")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", padding: "10px 14px", backgroundColor: "transparent", border: `1px dashed ${C.amber400}`, borderRadius: "10px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: C.amber700 }}>
                          Any other UPI app
                        </button>
                      </div>
                      <button onClick={() => setShowChooser(false)} style={{ background: "none", border: "none", padding: 0, fontSize: "11px", color: C.gray500, cursor: "pointer", textDecoration: "underline", display: "block", margin: "0 auto" }}>
                        ← Back to QR
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* ── Original UPI deep-link mode ─────────────────────────────── */
            !showChooser ? (
              <>
                <button
                  onClick={openUpiApp}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: "8px", width: "100%", padding: "14px 0",
                    backgroundColor: C.amber500, color: C.white,
                    borderRadius: "12px", fontWeight: 700, fontSize: "14px",
                    border: "none", cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(245,158,11,0.35)",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                    <line x1="12" y1="18" x2="12.01" y2="18"/>
                  </svg>
                  Pay ₹{orderTotal.toFixed(2)} via UPI
                </button>
                <p style={{ fontSize: "11px", color: C.amber600, textAlign: "center", margin: "6px 0 12px" }}>
                  Opens GPay, PhonePe, Paytm or any UPI app
                </p>
              </>
            ) : (
              <div style={{ marginBottom: "12px" }}>
                {isInAppBrowser && (
                  <div style={{ backgroundColor: C.blue50, border: "1px solid #bfdbfe", borderRadius: "10px", padding: "10px 12px", marginBottom: "10px", fontSize: "11px", color: C.blue600, lineHeight: "1.5" }}>
                    <strong>Tip:</strong> You&apos;re using an in-app browser (WhatsApp/Instagram). For best results, open this page in <strong>Chrome</strong> or your default browser, or scan the QR code below.
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
                  {UPI_APPS.map((app) => {
                    const href = isAndroid && app.id !== "paytm" ? makeIntentUrl(upiLink, app.pkg) : upiLink;
                    return (
                      <button key={app.id} onClick={() => openApp(href, app.label)} style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "11px 14px", backgroundColor: C.white, border: `1.5px solid ${C.amber200}`, borderRadius: "10px", cursor: "pointer", fontSize: "13px", fontWeight: 700, color: C.gray900 }}>
                        {app.icon}
                        {app.label}
                      </button>
                    );
                  })}
                  <button onClick={() => openApp(upiLink, "any UPI app")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", padding: "10px 14px", backgroundColor: "transparent", border: `1px dashed ${C.amber400}`, borderRadius: "10px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: C.amber700 }}>
                    Any other UPI app
                  </button>
                </div>
                <button onClick={() => setShowChooser(false)} style={{ background: "none", border: "none", padding: 0, fontSize: "11px", color: C.gray500, cursor: "pointer", textDecoration: "underline", display: "block", margin: "0 auto" }}>
                  ← Try the single tap button again
                </button>
              </div>
            )
          )}

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
              Enter UPI Reference / UTR Number{" "}
              <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              value={utrNumber}
              onChange={(e) => {
                onUtrChange(e.target.value.replace(/\s/g, ""));
                setUtrTouched(true);
              }}
              onBlur={() => setUtrTouched(true)}
              placeholder="e.g. 427123456789"
              style={{
                width: "100%",
                height: "40px",
                padding: "0 12px",
                borderRadius: "10px",
                border: `1.5px solid ${utrTouched && !isUtrValid(utrNumber) ? "#ef4444" : C.amber200}`,
                backgroundColor: C.white,
                fontSize: "13px",
                color: C.gray900,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {utrTouched && !isUtrValid(utrNumber) ? (
              <p style={{ fontSize: "10px", color: "#ef4444", margin: "4px 0 0" }}>
                {utrNumber.trim().length === 0
                  ? "UTR number is required to confirm your payment"
                  : utrNumber.trim().length < 8
                  ? "UTR number must be at least 8 characters"
                  : "UTR number must contain only letters and numbers"}
              </p>
            ) : (
              <p style={{ fontSize: "10px", color: C.amber600, margin: "4px 0 0" }}>
                You can find this in your payment app transaction details
              </p>
            )}
          </div>

          {/* QR fallback toggle — only in UPI deep-link mode; not needed when QR image is shown */}
          {!restaurant.hasPaymentQr && (
            <>
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
            </>
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
            onClick={() => {
              setUtrTouched(true);
              if (!isUtrValid(utrNumber)) return;
              onConfirmPayment();
            }}
            disabled={confirmingPayment}
            style={{
              width: "100%", padding: "14px 0",
              borderRadius: "12px",
              backgroundColor: isUtrValid(utrNumber) ? C.orangeDark : "#9ca3af",
              color: C.white,
              fontWeight: 700, fontSize: "14px",
              marginBottom: "10px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              opacity: confirmingPayment ? 0.6 : 1,
              cursor: confirmingPayment ? "not-allowed" : "pointer",
              border: "none",
              boxShadow: isUtrValid(utrNumber) ? "0 2px 8px rgba(194,65,12,0.30)" : "none",
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
