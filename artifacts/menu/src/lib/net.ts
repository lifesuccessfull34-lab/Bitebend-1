/**
 * Shared networking utility — Menu App
 *
 * Provides:
 *   fetchWithTimeout()  — fetch() wrapped with an AbortController timeout
 *   safeJson()          — JSON parser that throws a clean error on non-JSON bodies
 *   extractApiError()   — reads { error } from a non-ok response body; falls back to a default
 *   TIMEOUTS            — named timeout constants
 *
 * Retry policy (enforced by convention, not code):
 *   GET / HEAD requests may be retried at the call-site.
 *   POST / PUT / PATCH / DELETE must NEVER be retried automatically — duplicate order
 *   placement, duplicate uploads, or double-charging are not recoverable by a retry.
 */

export const TIMEOUTS = {
  /** Session status polling — small payload, fast path. */
  SHORT: 5_000,
  /** Standard GET requests — menu load, order history search. */
  DEFAULT: 10_000,
  /** Order placement POST — must reach the server; allow a little more headroom. */
  ORDER: 15_000,
  /** Payment screenshot upload — large base64 body on a slow mobile connection. */
  UPLOAD: 60_000,
} as const;

/**
 * Wraps `fetch()` with an AbortController timeout.
 *
 * Returns the raw `Response` — callers decide what to do with `res.ok`, `res.status`,
 * and the body.  This preserves all business-logic decisions in the caller.
 *
 * On timeout the `AbortError` propagates unchanged so callers can check
 * `err.name === "AbortError"` and show a user-friendly message.
 *
 * Any `signal` passed in `options` is **ignored** — the internal controller owns the
 * lifecycle.  This is intentional: the timeout is the only cancellation mechanism.
 */
export async function fetchWithTimeout(
  url: string,
  options: Omit<RequestInit, "signal"> = {},
  timeoutMs: number = TIMEOUTS.DEFAULT,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    // Always clear the timer — whether the fetch resolved, rejected, or was aborted.
    // AbortError propagates unchanged to the caller.
    clearTimeout(timer);
  }
}

/**
 * Parses a `Response` body as JSON.
 *
 * Throws a descriptive `Error` (not a raw `SyntaxError`) when the body is not valid
 * JSON — e.g. an HTML 502 error page returned by a reverse proxy.
 */
export async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Server returned an unexpected response (HTTP ${res.status})`);
  }
}

/**
 * Attempts to read a `{ error: string }` field from a non-ok response body.
 * Falls back silently to `fallback` if the body is absent, non-JSON, or has no
 * `.error` field — so this is always safe to call on any failed response.
 */
export async function extractApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await safeJson<{ error?: string }>(res);
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}
