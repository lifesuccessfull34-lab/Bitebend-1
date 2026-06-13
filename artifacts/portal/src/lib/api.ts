export const API_BASE = "/api";

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
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
