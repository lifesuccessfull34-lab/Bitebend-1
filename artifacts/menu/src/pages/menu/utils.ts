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
  const pa = encodeURIComponent(upiId);
  const pn = encodeURIComponent(name);
  const am = amount.toFixed(2);
  const tr = encodeURIComponent(`BITEBN${orderId}`);
  const tn = encodeURIComponent(`Order #${orderId}`);
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tr=${tr}&tn=${tn}`;
}
