/**
 * @workspace/url-utils
 *
 * Shared restaurant URL parameter normalisation used by BOTH the API server and
 * the customer menu frontend. Keeping the logic in one place ensures that any
 * future change is automatically applied everywhere and stays tested.
 *
 * History: Google Lens / QR scanner browsers append %0A (newline), uppercase
 * slugs, or trailing slashes to scanned URLs. Without normalisation the
 * restaurant lookup silently failed with "Invalid restaurant". These utilities
 * are the single source of truth for all param handling.
 */

// ─── Primitive helpers (exported for direct use and for testing) ──────────────

/**
 * Safely decode a percent-encoded URI component without throwing.
 * Falls back to the raw string when the input contains invalid escape sequences
 * (e.g. malformed QR codes that produce "%GG" or similar artifacts).
 *
 * @example
 *   safeDecodeURIComponent("spice-garden%0A") // → "spice-garden\n"
 *   safeDecodeURIComponent("%ZZ")              // → "%ZZ"  (no throw)
 *   safeDecodeURIComponent("")                 // → ""
 */
export function safeDecodeURIComponent(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding — use the raw string so we still attempt lookup
    return raw;
  }
}

/**
 * Strip all trailing forward-slashes from a string.
 * Google Lens, Samsung Internet, and some Android WebViews append a stray "/"
 * to scanned URLs; wouter route matching would then fail without this strip.
 *
 * Note: a lone "/" is reduced to "" — callers receiving an empty string should
 * treat it as "no param provided" and short-circuit before the DB lookup.
 *
 * @example
 *   removeTrailingSlash("spice-garden/")  // → "spice-garden"
 *   removeTrailingSlash("spice-garden//") // → "spice-garden"
 *   removeTrailingSlash("spice-garden")   // → "spice-garden"  (no-op)
 *   removeTrailingSlash("/")              // → ""
 */
export function removeTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

// ─── Composite normaliser ─────────────────────────────────────────────────────

/**
 * Normalise a raw restaurant URL parameter so the same restaurant is found
 * regardless of how Google Lens, QR scanner apps, or browsers transform the URL.
 *
 * Composed from the primitive helpers above (in order):
 *  1. safeDecodeURIComponent — handles %0A (newline), %20 (space), %2D, etc.
 *  2. trim (pass 1)          — removes leading/trailing whitespace/newlines
 *  3. removeTrailingSlash    — "/spice-garden/" → "/spice-garden"
 *  4. trim (pass 2)          — cleans whitespace sandwiched before a slash
 *                              e.g. "slug\n/" → trim → "slug\n" → trimmed → "slug"
 *  5. toLowerCase            — case-insensitive slug comparison
 *
 * Numeric ID strings ("1", "42") are valid after these transforms:
 * toLowerCase is a no-op on digits, and trim/strip don't affect clean numbers.
 *
 * @example
 *   normalizeRestaurantParam("Spice-Garden%0A/") // → "spice-garden"
 *   normalizeRestaurantParam("1%0A")              // → "1"
 *   normalizeRestaurantParam("42")                // → "42"
 */
export function normalizeRestaurantParam(raw: string): string {
  return removeTrailingSlash(safeDecodeURIComponent(raw).trim()).trim().toLowerCase();
}

// ─── Type discriminator ───────────────────────────────────────────────────────

/**
 * Returns true when the *already-normalised* param is a pure positive integer,
 * meaning it should be resolved as a numeric database primary key rather than
 * a restaurant slug.
 *
 * IMPORTANT: always call normalizeRestaurantParam() first.
 *
 * @example
 *   isNumericRestaurantParam("42")          // → true
 *   isNumericRestaurantParam("spice-garden") // → false
 *   isNumericRestaurantParam("1abc")         // → false  (not purely numeric)
 */
export function isNumericRestaurantParam(param: string): boolean {
  return /^\d+$/.test(param);
}
