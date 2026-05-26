/**
 * REGRESSION TESTS — QR code scanning / Google Lens browser compatibility
 *
 * These tests specifically guard against reintroducing the parseInt-only
 * restaurant resolution bug that caused "Menu Unavailable / Invalid restaurant"
 * when QR codes were scanned via Google Lens, Samsung Browser, or other
 * in-app browsers.
 *
 * History:
 *   The original code did `parseInt(params.restaurantId)` on the frontend and
 *   `parseInt(req.params.restaurantId)` on the API for order/payment routes.
 *   For slug-based QR codes (e.g. "spice-garden"), parseInt returns NaN which
 *   is falsy — the frontend short-circuited and never called the API at all.
 *
 * Second regression (React error #310 — "Maximum update depth exceeded"):
 *   A TrailingSlashNormaliser component called navigate() directly in the
 *   render body (not inside useEffect). Every render triggered another
 *   navigate() call → infinite re-render loop → React crash on mobile browsers.
 *   Fixed by using explicit trailing-slash route variants in the wouter Switch
 *   instead of any runtime navigation component.
 *
 * DO NOT delete or weaken these tests.
 */
import { describe, it, expect } from "vitest";
import { normalizeRestaurantParam, isNumericRestaurantParam, safeDecodeURIComponent } from "../index";

// ─── parseInt-only handling guard ─────────────────────────────────────────────

describe("REGRESSION: parseInt-only handling must not be reintroduced", () => {
  it("slug param survives normalisation as a slug (not NaN)", () => {
    const result = normalizeRestaurantParam("spice-garden");
    expect(result).toBe("spice-garden");
    expect(result).not.toBe("");
    expect(isNumericRestaurantParam(result)).toBe(false);
    expect(Number.isNaN(parseInt(result, 10))).toBe(true);
  });

  it("numeric param is identified as numeric after normalisation", () => {
    const result = normalizeRestaurantParam("1");
    expect(result).toBe("1");
    expect(isNumericRestaurantParam(result)).toBe(true);
  });

  it("Google Lens %0A suffix is stripped from slugs (slug lookup must succeed)", () => {
    const result = normalizeRestaurantParam("spice-garden%0A");
    expect(result).toBe("spice-garden");
    expect(isNumericRestaurantParam(result)).toBe(false);
  });

  it("Google Lens %0A suffix is stripped from numeric IDs (numeric lookup must succeed)", () => {
    const result = normalizeRestaurantParam("1%0A");
    expect(result).toBe("1");
    expect(isNumericRestaurantParam(result)).toBe(true);
  });

  it("uppercase slug is lowercased (case-sensitive DB eq would otherwise miss)", () => {
    const result = normalizeRestaurantParam("Spice-Garden");
    expect(result).toBe("spice-garden");
  });

  it("trailing slash is stripped before route matching", () => {
    const result = normalizeRestaurantParam("spice-garden/");
    expect(result).toBe("spice-garden");
  });

  it("combined worst-case: uppercase + %0A + trailing slash", () => {
    const result = normalizeRestaurantParam("Spice-Garden%0A/");
    expect(result).toBe("spice-garden");
    expect(isNumericRestaurantParam(result)).toBe(false);
  });

  it("normalisation never converts a slug to a number (no implicit parseInt)", () => {
    const slug = normalizeRestaurantParam("spice-garden");
    const asNumber = Number(slug);
    expect(Number.isNaN(asNumber)).toBe(true);
  });
});

// ─── Production browser regression scenarios ──────────────────────────────────

describe("REGRESSION: production browser / WebView URL edge cases", () => {
  it("Samsung Internet — appends %0D%0A (CRLF) to scanned URLs", () => {
    // Samsung Internet / some Android QR readers use CRLF line endings
    expect(normalizeRestaurantParam("spice-garden%0D%0A")).toBe("spice-garden");
    expect(normalizeRestaurantParam("1%0D%0A")).toBe("1");
  });

  it("Android WebView — adds trailing slash after host+path decode", () => {
    expect(normalizeRestaurantParam("spice-garden/")).toBe("spice-garden");
    expect(normalizeRestaurantParam("spice-garden//")).toBe("spice-garden");
  });

  it("iOS Safari in-app browser — adds %20 padding around slug", () => {
    expect(normalizeRestaurantParam("%20spice-garden%20")).toBe("spice-garden");
  });

  it("Google Lens — uppercase + newline + trailing slash (worst-case composite)", () => {
    expect(normalizeRestaurantParam("SPICE-GARDEN%0A/")).toBe("spice-garden");
  });

  it("malformed QR code — invalid percent-encoding falls back to raw string, no crash", () => {
    // A damaged QR code might produce malformed sequences; we must never throw.
    expect(() => normalizeRestaurantParam("spice-%ZZ-garden")).not.toThrow();
    const result = normalizeRestaurantParam("spice-%ZZ-garden");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("malformed QR code — lone percent sign at end, no crash", () => {
    expect(() => normalizeRestaurantParam("spice-garden%")).not.toThrow();
    const result = normalizeRestaurantParam("spice-garden%");
    expect(typeof result).toBe("string");
  });

  it("direct URL open — clean numeric ID with no scanner artifacts", () => {
    expect(normalizeRestaurantParam("42")).toBe("42");
    expect(isNumericRestaurantParam("42")).toBe(true);
  });

  it("WhatsApp / Telegram in-app browser — may encode the whole path segment twice", () => {
    // Double-encoded: %250A is %0A with the % itself encoded as %25
    // decodeURIComponent("%250A") → "%0A" (a literal string, not a newline)
    // After decode: "spice-garden%0A" → second decode needed — but we only decode once.
    // Single decode pass is correct; double-encoding is the sender's fault.
    const decoded = safeDecodeURIComponent("spice-garden%250A");
    // After one decode: "spice-garden%0A" (still has encoded newline)
    expect(decoded).toBe("spice-garden%0A");
    // Full normalise trims %0A as a literal string after decode (it's now just chars)
    const result = normalizeRestaurantParam("spice-garden%250A");
    expect(typeof result).toBe("string");
    // It won't equal "spice-garden" but it must not crash
    expect(result).not.toBe("");
  });

  it("QR code trailing whitespace — spaces and tabs are removed", () => {
    expect(normalizeRestaurantParam("spice-garden   ")).toBe("spice-garden");
    expect(normalizeRestaurantParam("   spice-garden   ")).toBe("spice-garden");
    expect(normalizeRestaurantParam("\t\tspice-garden\t\t")).toBe("spice-garden");
  });

  it("slug with hyphens and numbers remains intact", () => {
    expect(normalizeRestaurantParam("curry-house-2")).toBe("curry-house-2");
    expect(normalizeRestaurantParam("Curry-House-2%0A")).toBe("curry-house-2");
  });
});

// ─── React render-loop guard (error #310) ─────────────────────────────────────

describe("REGRESSION: trailing-slash route matching must not require runtime navigation", () => {
  it("slug with trailing slash normalises cleanly — no navigate() needed", () => {
    // The fix: explicit trailing-slash route variants in the wouter Switch.
    // normalizeRestaurantParam handles the param; the route already matched.
    expect(normalizeRestaurantParam("spice-garden/")).toBe("spice-garden");
    expect(normalizeRestaurantParam("spice-garden%0A/")).toBe("spice-garden");
  });

  it("numeric ID with trailing slash normalises cleanly", () => {
    expect(normalizeRestaurantParam("1/")).toBe("1");
    expect(isNumericRestaurantParam(normalizeRestaurantParam("1/"))).toBe(true);
  });

  it("normaliseRestaurantParam is a pure function — same input always gives same output", () => {
    const input = "Spice-Garden%0A/";
    const first = normalizeRestaurantParam(input);
    const second = normalizeRestaurantParam(input);
    const third = normalizeRestaurantParam(first); // idempotent
    expect(first).toBe(second);
    expect(second).toBe(third);
  });
});
