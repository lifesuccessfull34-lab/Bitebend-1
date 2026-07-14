/**
 * Shared image URL helper — Menu App
 *
 * Mirrors the Portal's `resolveImageUrl` (artifacts/portal/src/lib/api.ts).
 * Converts a possibly-relative media URL (as returned by the API, e.g.
 * "/api/images/<uuid>") into an absolute URL pointing at the API server,
 * using VITE_API_URL. This is required when the frontend is deployed on a
 * different origin than the API server (e.g. separate Railway services) —
 * a bare "/api/images/..." path would otherwise resolve against the
 * frontend's own origin and 404.
 *
 * Leaves already-absolute URLs (http/https), data URIs, blob URLs, and
 * other non-/api paths untouched. Preserves null/undefined so callers can
 * keep using `value ?? fallback` patterns.
 */

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

// Origin only (no /api suffix) — used to resolve relative /api/... media URLs
// (e.g. /api/images/<uuid>) to an absolute URL when the frontend is deployed
// on a different domain than the API server (e.g. separate Railway services).
export const API_ORIGIN = BASE;

export function resolveImageUrl<T extends string | null | undefined>(url: T): T {
  if (url == null || url === "") return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/api/")) {
    return `${API_ORIGIN}${url}` as T;
  }
  return url;
}
