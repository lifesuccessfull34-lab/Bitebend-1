const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export const API_BASE = `${BASE}/api`;

// Origin only (no /api suffix) — used to resolve relative /api/... media URLs
// (e.g. /api/images/<uuid>) to an absolute URL when the frontend is deployed
// on a different domain than the API server (e.g. separate Railway services).
export const API_ORIGIN = BASE;

/**
 * Converts a possibly-relative media URL (as returned by upload endpoints,
 * e.g. "/api/images/<uuid>") into an absolute URL pointing at the API
 * server, using VITE_API_URL. Leaves already-absolute URLs (http/https),
 * data URIs, blob URLs, and other non-/api paths untouched. Preserves
 * null/undefined so callers can keep using `value ?? fallback` patterns.
 */
export function resolveImageUrl<T extends string | null | undefined>(url: T): T {
  if (url == null || url === "") return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/api/")) {
    return `${API_ORIGIN}${url}` as T;
  }
  return url;
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Default request timeout in ms.
 * Prevents fetch from hanging indefinitely on slow/unreliable mobile
 * connections, which would leave AuthContext.loading=true forever and
 * keep the spinner on screen permanently.
 * Set to 6s to match the AuthContext bail timer — both resolve together.
 */
const DEFAULT_TIMEOUT_MS = 6_000;

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const { timeoutMs: _t, ...fetchInit } = init ?? {};

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...fetchInit.headers },
      signal: controller.signal,
      ...fetchInit,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ApiError(0, "Request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    const message = (body as { error: string }).error ?? "Request failed";
    if ((res.status === 401 || res.status === 403) && onUnauthorized) {
      onUnauthorized();
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
