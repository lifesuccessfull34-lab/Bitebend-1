// ── Safe localStorage helpers ─────────────────────────────────────────────────
// localStorage can be null on some mobile browsers when storage is blocked
// (e.g. iOS Safari "Block All Cookies" mode).

export function lsGet(key: string): string {
  try {
    return localStorage?.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function lsSet(key: string, value: string): void {
  try {
    localStorage?.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// ── UPI Text Sanitizer ────────────────────────────────────────────────────────
// Different UPI apps parse reserved characters differently. For example, Paytm
// fails on # (even percent-encoded), and other apps can choke on ? & = % ; : / \.
// This helper strips all such characters from human-readable fields (pn, tn, tr)
// before they reach either the upi:// URL or the Android intent:// URL.
//
// NOTE: Do NOT apply this to the payee address (pa). The @ separator in a VPA
// (e.g. merchant@upi) is required and must never be stripped.

export function sanitizeUPIText(value: string, maxLen: number): string {
  return value
    .replace(/[#?&=%:;/\\]/g, "")   // remove UPI-reserved / URL-special chars
    .replace(/\s+/g, " ")            // collapse repeated whitespace
    .trim()
    .slice(0, maxLen);
}

// ── UPI Deep Link Generator ───────────────────────────────────────────────────
// Uses encodeURIComponent (produces %20 for spaces) rather than URLSearchParams
// (which produces + for spaces). The BHIM/UPI spec requires %20 encoding; several
// UPI apps (GPay, PhonePe, Paytm) misparse + in payee-name or transaction-note.

export function generateUPILink(
  upiId: string,
  name: string,
  amount: number,
  orderId: number,
): string {
  // pa (payee VPA) must NOT be sanitized or encoded — the @ separator is part
  // of the UPI address format and must arrive as a literal @. Encoding it to
  // %40 causes every UPI app to fail VPA resolution.
  const pa = upiId.trim();

  // pn / tn: sanitize reserved chars first, then %20-encode spaces.
  // URLSearchParams emits + for spaces which many apps misparse, so we build
  // the string manually with encodeURIComponent after sanitizing.
  const pn = encodeURIComponent(sanitizeUPIText(name, 50));

  // amount must be a decimal string with exactly two decimal places, no currency
  // symbol (e.g. "250.00" not "₹250" or "250 INR").
  const am = Number(amount).toFixed(2);

  // tr is the unique transaction reference. It already contains only
  // alphanumeric characters, but sanitize defensively to keep it clean.
  const tr = sanitizeUPIText(`BITEBN${orderId}`, 50);

  // tn: sanitize to strip any chars (e.g. #) that Android's intent URL parser
  // would decode back to a reserved character and split the intent URL.
  const tn = encodeURIComponent(sanitizeUPIText(`Order ${orderId}`, 50));

  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tr=${tr}&tn=${tn}`;
}
