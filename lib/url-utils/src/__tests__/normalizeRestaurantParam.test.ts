import { describe, it, expect } from "vitest";
import {
  normalizeRestaurantParam,
  isNumericRestaurantParam,
  safeDecodeURIComponent,
  removeTrailingSlash,
} from "../index";

// ─── safeDecodeURIComponent ───────────────────────────────────────────────────

describe("safeDecodeURIComponent", () => {
  it("decodes a normal percent-encoded slug", () => {
    expect(safeDecodeURIComponent("spice%2Dgarden")).toBe("spice-garden");
  });

  it("decodes %0A to a newline character", () => {
    expect(safeDecodeURIComponent("spice-garden%0A")).toBe("spice-garden\n");
  });

  it("decodes %20 to a space", () => {
    expect(safeDecodeURIComponent("spice%20garden")).toBe("spice garden");
  });

  it("decodes %0D%0A (CRLF) to carriage-return + newline", () => {
    expect(safeDecodeURIComponent("slug%0D%0A")).toBe("slug\r\n");
  });

  it("returns the raw string for malformed percent-encoding (no throw)", () => {
    expect(() => safeDecodeURIComponent("%ZZ")).not.toThrow();
    expect(safeDecodeURIComponent("%ZZ")).toBe("%ZZ");
  });

  it("returns the raw string for a lone percent sign", () => {
    expect(() => safeDecodeURIComponent("slug%")).not.toThrow();
    expect(safeDecodeURIComponent("slug%")).toBe("slug%");
  });

  it("passes through a plain string unchanged", () => {
    expect(safeDecodeURIComponent("spice-garden")).toBe("spice-garden");
  });

  it("handles empty string", () => {
    expect(safeDecodeURIComponent("")).toBe("");
  });
});

// ─── removeTrailingSlash ──────────────────────────────────────────────────────

describe("removeTrailingSlash", () => {
  it("removes a single trailing slash", () => {
    expect(removeTrailingSlash("spice-garden/")).toBe("spice-garden");
  });

  it("removes multiple consecutive trailing slashes", () => {
    expect(removeTrailingSlash("spice-garden//")).toBe("spice-garden");
    expect(removeTrailingSlash("spice-garden///")).toBe("spice-garden");
  });

  it("is a no-op when there is no trailing slash", () => {
    expect(removeTrailingSlash("spice-garden")).toBe("spice-garden");
  });

  it("reduces a lone slash to an empty string", () => {
    expect(removeTrailingSlash("/")).toBe("");
  });

  it("handles empty string", () => {
    expect(removeTrailingSlash("")).toBe("");
  });

  it("does not remove internal slashes", () => {
    expect(removeTrailingSlash("a/b/c")).toBe("a/b/c");
    expect(removeTrailingSlash("a/b/c/")).toBe("a/b/c");
  });
});

// ─── normalizeRestaurantParam ─────────────────────────────────────────────────

describe("normalizeRestaurantParam", () => {
  // ── Happy paths ────────────────────────────────────────────────────────────

  it("returns a clean numeric ID string unchanged", () => {
    expect(normalizeRestaurantParam("1")).toBe("1");
    expect(normalizeRestaurantParam("42")).toBe("42");
    expect(normalizeRestaurantParam("1000")).toBe("1000");
  });

  it("returns a clean lowercase slug unchanged", () => {
    expect(normalizeRestaurantParam("spice-garden")).toBe("spice-garden");
    expect(normalizeRestaurantParam("my-restaurant")).toBe("my-restaurant");
  });

  // ── URL decoding ───────────────────────────────────────────────────────────

  it("decodes %0A trailing newline (Google Lens / QR scanner artefact)", () => {
    expect(normalizeRestaurantParam("spice-garden%0A")).toBe("spice-garden");
    expect(normalizeRestaurantParam("1%0A")).toBe("1");
  });

  it("decodes %20 spaces", () => {
    expect(normalizeRestaurantParam("spice-garden%20")).toBe("spice-garden");
    expect(normalizeRestaurantParam("%20spice-garden")).toBe("spice-garden");
    expect(normalizeRestaurantParam("%20spice-garden%20")).toBe("spice-garden");
  });

  it("decodes %2D (hyphen) and other encoded characters", () => {
    expect(normalizeRestaurantParam("spice%2Dgarden")).toBe("spice-garden");
  });

  it("decodes %0D%0A (Windows CRLF newline)", () => {
    expect(normalizeRestaurantParam("spice-garden%0D%0A")).toBe("spice-garden");
  });

  it("decodes %09 (tab character from some WebView URL parsers)", () => {
    expect(normalizeRestaurantParam("spice-garden%09")).toBe("spice-garden");
  });

  // ── Case normalisation ─────────────────────────────────────────────────────

  it("lowercases uppercase slugs", () => {
    expect(normalizeRestaurantParam("Spice-Garden")).toBe("spice-garden");
    expect(normalizeRestaurantParam("SPICE-GARDEN")).toBe("spice-garden");
  });

  it("lowercases mixed-case slugs", () => {
    expect(normalizeRestaurantParam("SpIcE-GaRdEn")).toBe("spice-garden");
  });

  it("lowercase is a no-op for numeric IDs", () => {
    expect(normalizeRestaurantParam("42")).toBe("42");
  });

  // ── Trailing slash ─────────────────────────────────────────────────────────

  it("strips single trailing slash", () => {
    expect(normalizeRestaurantParam("spice-garden/")).toBe("spice-garden");
    expect(normalizeRestaurantParam("1/")).toBe("1");
  });

  it("strips multiple trailing slashes", () => {
    expect(normalizeRestaurantParam("spice-garden//")).toBe("spice-garden");
    expect(normalizeRestaurantParam("spice-garden///")).toBe("spice-garden");
  });

  // ── Whitespace / newlines ──────────────────────────────────────────────────

  it("trims leading and trailing ASCII spaces", () => {
    expect(normalizeRestaurantParam("  spice-garden  ")).toBe("spice-garden");
  });

  it("trims literal newline characters", () => {
    expect(normalizeRestaurantParam("\nspice-garden\n")).toBe("spice-garden");
    expect(normalizeRestaurantParam("\r\nspice-garden\r\n")).toBe("spice-garden");
  });

  it("trims tab characters", () => {
    expect(normalizeRestaurantParam("\tspice-garden\t")).toBe("spice-garden");
  });

  // ── Combined scenarios (real browser misbehaviours) ────────────────────────

  it("handles %0A + trailing slash combined", () => {
    expect(normalizeRestaurantParam("spice-garden%0A/")).toBe("spice-garden");
  });

  it("handles uppercase + %0A + trailing slash combined", () => {
    expect(normalizeRestaurantParam("Spice-Garden%0A/")).toBe("spice-garden");
  });

  it("handles numeric + %0A + trailing slash", () => {
    expect(normalizeRestaurantParam("1%0A/")).toBe("1");
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("returns empty string for empty input", () => {
    expect(normalizeRestaurantParam("")).toBe("");
  });

  it("does not throw on malformed percent-encoding", () => {
    expect(() => normalizeRestaurantParam("%ZZ")).not.toThrow();
  });

  it("handles malformed percent-encoding gracefully (falls back to raw)", () => {
    const result = normalizeRestaurantParam("%ZZ");
    expect(typeof result).toBe("string");
    expect(result).toBe("%zz");
  });

  it("normalizeRestaurantParam composes safeDecodeURIComponent + removeTrailingSlash", () => {
    // Verify the two primitives are composed consistently
    const raw = "Spice-Garden%0A/";
    const step1 = safeDecodeURIComponent(raw).trim();  // "Spice-Garden\n"
    const step2 = removeTrailingSlash(step1).trim();   // "Spice-Garden" (trim clears \n from step 1 remainder)
    const step3 = step2.toLowerCase();                 // "spice-garden"
    expect(normalizeRestaurantParam(raw)).toBe(step3);
  });
});

// ─── isNumericRestaurantParam ─────────────────────────────────────────────────

describe("isNumericRestaurantParam", () => {
  it("returns true for pure positive integer strings", () => {
    expect(isNumericRestaurantParam("1")).toBe(true);
    expect(isNumericRestaurantParam("42")).toBe(true);
    expect(isNumericRestaurantParam("1000")).toBe(true);
    expect(isNumericRestaurantParam("0")).toBe(true);
  });

  it("returns false for slug strings", () => {
    expect(isNumericRestaurantParam("spice-garden")).toBe(false);
    expect(isNumericRestaurantParam("my-restaurant")).toBe(false);
    expect(isNumericRestaurantParam("abc")).toBe(false);
  });

  it("returns false for mixed alphanumeric strings", () => {
    expect(isNumericRestaurantParam("1abc")).toBe(false);
    expect(isNumericRestaurantParam("abc1")).toBe(false);
  });

  it("returns false for floats", () => {
    expect(isNumericRestaurantParam("1.0")).toBe(false);
    expect(isNumericRestaurantParam("3.14")).toBe(false);
  });

  it("returns false for negative numbers", () => {
    expect(isNumericRestaurantParam("-1")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isNumericRestaurantParam("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(isNumericRestaurantParam(" ")).toBe(false);
    expect(isNumericRestaurantParam("  42  ")).toBe(false);
  });
});
