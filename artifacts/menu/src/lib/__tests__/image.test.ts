import { describe, it, expect } from "vitest";
import { resolveImageUrl } from "../image";

// resolveImageUrl mirrors the Portal's implementation (artifacts/portal/src/lib/api.ts)
// and is loaded with VITE_API_URL="http://127.0.0.1:8080" (see vitest.config.ts / .env.test)
// so we can assert the exact absolute URL it produces.

describe("resolveImageUrl", () => {
  it("passes through null and undefined unchanged", () => {
    expect(resolveImageUrl(null)).toBeNull();
    expect(resolveImageUrl(undefined)).toBeUndefined();
  });

  it("passes through an empty string unchanged", () => {
    expect(resolveImageUrl("")).toBe("");
  });

  it("leaves already-absolute http(s) URLs untouched", () => {
    expect(resolveImageUrl("https://example.com/foo.jpg")).toBe("https://example.com/foo.jpg");
    expect(resolveImageUrl("http://example.com/foo.jpg")).toBe("http://example.com/foo.jpg");
  });

  it("leaves non-/api paths (e.g. data URIs, blob URLs) untouched", () => {
    expect(resolveImageUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(resolveImageUrl("blob:http://localhost/abc-123")).toBe("blob:http://localhost/abc-123");
  });

  it("prefixes a relative /api/images/... URL with the configured API origin", () => {
    expect(resolveImageUrl("/api/images/abc-123")).toBe("http://127.0.0.1:8080/api/images/abc-123");
  });
});
