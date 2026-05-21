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
  // pa (payee VPA) must NOT be encoded — the @ separator is part of the UPI
  // address format and must arrive as a literal @. Encoding it to %40 causes
  // every UPI app (GPay, PhonePe, Paytm) to fail VPA resolution, which is why
  // the app opens but fields are not prefilled.
  const pa = upiId.trim();
  // pn / tn: use %20 for spaces (UPI spec); URLSearchParams emits + which many
  // apps misparse, so we build the string manually with encodeURIComponent.
  const pn = encodeURIComponent(name.trim());
  // amount must be a decimal string with exactly two decimal places, no currency
  // symbol (e.g. "250.00" not "₹250" or "250 INR").
  const am = Number(amount).toFixed(2);
  // tr is the unique transaction reference; alphanumeric, no encoding needed.
  const tr = `BITEBN${orderId}`;
  const tn = encodeURIComponent(`Order #${orderId}`);
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tr=${tr}&tn=${tn}`;
}
