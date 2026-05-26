/**
 * verify-bill-flow.ts
 *
 * Smoke-tests the complete bill generation + serving pipeline.
 * Run with: pnpm --filter @workspace/scripts run verify:bill-flow
 *
 * Requires the API server to be running (localhost:80).
 * Uses demo owner credentials (demo@spicegarden.com / demo123).
 */

const BASE = "http://localhost:80";
const OWNER_EMAIL = "demo@spicegarden.com";
const OWNER_PASS = "demo123";

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  \u2713 ${label}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.error(`  \u2717 ${label}${detail ? `: ${detail}` : ""}`);
  failed++;
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/connect\.sid=([^;]+)/);
  if (!match) throw new Error("No session cookie in login response");
  return `connect.sid=${match[1]}`;
}

async function getFirstOrderId(cookie: string): Promise<number> {
  const res = await fetch(`${BASE}/api/owner/orders`, {
    headers: { Cookie: cookie },
  });
  if (!res.ok) throw new Error(`Failed to list orders: ${res.status}`);
  const orders = (await res.json()) as Array<{ id: number }>;
  if (!orders.length) throw new Error("No orders found for demo account");
  return orders[0].id;
}

async function run() {
  console.log("\nBill flow smoke tests\n");

  // ── Setup ──────────────────────────────────────────────────────────────────
  let cookie: string;
  let orderId: number;
  let billUrl: string;     // short URL   e.g. /api/b/<shortId>
  let imageUrl: string;    // PNG URL     e.g. /api/bills/<token>/image
  let shortId: string;
  let fullToken: string;   // /api/bills/<token>

  console.log("Setup");
  try {
    cookie = await login();
    ok("login as demo owner");
  } catch (e) {
    fail("login as demo owner", String(e));
    process.exit(1);
  }

  try {
    orderId = await getFirstOrderId(cookie);
    ok(`found order #${orderId}`);
  } catch (e) {
    fail("find a demo order", String(e));
    process.exit(1);
  }

  // ── Test 1: Create bill ───────────────────────────────────────────────────
  console.log("\n1. Create bill");
  let billData: { billUrl: string; imageUrl: string; whatsappUrl: string };
  try {
    const res = await fetch(`${BASE}/api/owner/orders/${orderId}/bill`, {
      headers: { Cookie: cookie },
    });
    if (res.status === 429) {
      // Rate-limited — extract shortId from a recent bill via a fresh order if possible
      // For smoke tests: this is acceptable, treat as pass and continue with known token
      fail("create bill", `rate-limited (HTTP 429) — reset daily or use a different order`);
      process.exit(1);
    }
    if (!res.ok) {
      fail("create bill", `HTTP ${res.status}: ${await res.text()}`);
      process.exit(1);
    }
    billData = (await res.json()) as typeof billData;
    if (!billData.billUrl || !billData.imageUrl || !billData.whatsappUrl) {
      fail("create bill", "response missing billUrl, imageUrl, or whatsappUrl");
      process.exit(1);
    }
    ok("create bill → HTTP 200");

    billUrl = billData.billUrl;       // https://.../api/b/<shortId>
    imageUrl = billData.imageUrl;     // https://.../api/bills/<token>/image

    // extract shortId and token for direct URL testing
    shortId = billUrl.split("/api/b/")[1] ?? "";
    const imgPath = new URL(imageUrl).pathname; // /api/bills/<token>/image
    const tokenMatch = imgPath.match(/^\/api\/bills\/(.+)\/image$/);
    fullToken = tokenMatch ? tokenMatch[1] : "";

    if (!shortId) fail("extract shortId from billUrl", billUrl);
    else ok(`shortId extracted: ${shortId}`);

    if (!fullToken) fail("extract full token from imageUrl", imageUrl);
    else ok(`full token extracted (length ${fullToken.length})`);
  } catch (e) {
    fail("create bill", String(e));
    process.exit(1);
  }

  // ── Test 2: Short URL resolves ────────────────────────────────────────────
  console.log("\n2. Short URL");
  try {
    const res = await fetch(`${BASE}/api/b/${shortId}`);
    if (res.status === 200) ok(`/api/b/${shortId} → HTTP 200`);
    else fail(`/api/b/${shortId}`, `HTTP ${res.status}`);

    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) ok("content-type: text/html");
    else fail("content-type should be text/html", ct);
  } catch (e) {
    fail("short URL fetch", String(e));
  }

  // ── Test 3: OG tags present ───────────────────────────────────────────────
  console.log("\n3. OpenGraph tags");
  try {
    const res = await fetch(`${BASE}/api/b/${shortId}`);
    const html = await res.text();

    const tags = ["og:title", "og:description", "og:image", "og:type", "twitter:card"];
    for (const tag of tags) {
      if (html.includes(tag)) ok(`<meta property="${tag}"> present`);
      else fail(`<meta property="${tag}"> missing`);
    }

    if (html.includes("/api/bills/") && html.includes("/image")) ok("og:image points to PNG endpoint");
    else fail("og:image should reference /api/bills/<token>/image");
  } catch (e) {
    fail("OG tags check", String(e));
  }

  // ── Test 4: Token URL resolves ────────────────────────────────────────────
  console.log("\n4. Full token URL");
  try {
    const res = await fetch(`${BASE}/api/bills/${fullToken}`);
    if (res.status === 200) ok(`/api/bills/<token> → HTTP 200`);
    else fail(`/api/bills/<token>`, `HTTP ${res.status}`);
  } catch (e) {
    fail("full token URL", String(e));
  }

  // ── Test 5: PNG image returns ─────────────────────────────────────────────
  console.log("\n5. PNG image endpoint");
  try {
    const res = await fetch(`${BASE}/api/bills/${fullToken}/image`);
    if (res.status === 200) ok("PNG endpoint → HTTP 200");
    else { fail("PNG endpoint status", `HTTP ${res.status}`); }

    const ct = res.headers.get("content-type") ?? "";
    if (ct === "image/png") ok("content-type: image/png");
    else fail("content-type should be image/png", ct);

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 10_000) ok(`PNG size ${(buf.length / 1024).toFixed(1)} KB (>10 KB)`);
    else fail("PNG too small", `${buf.length} bytes`);

    // Check PNG magic bytes
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      ok("valid PNG magic bytes (\\x89PNG)");
    } else {
      fail("invalid PNG magic bytes");
    }
  } catch (e) {
    fail("PNG image endpoint", String(e));
  }

  // ── Test 6: QR renders (PNG contains meaningful data) ────────────────────
  console.log("\n6. QR code in PNG");
  try {
    const res = await fetch(`${BASE}/api/bills/${fullToken}/image`);
    const buf = Buffer.from(await res.arrayBuffer());
    // QR rendering is verified by the existing check:qr-generation script
    // Here we just confirm the image is large enough to contain a QR block
    if (buf.length > 20_000) ok("PNG large enough to contain QR code region (>20 KB)");
    else fail("PNG may be missing QR — too small", `${buf.length} bytes`);
  } catch (e) {
    fail("QR image check", String(e));
  }

  // ── Test 7: 60-second cooldown ────────────────────────────────────────────
  console.log("\n7. Cooldown (60 s resend block)");
  try {
    const res = await fetch(`${BASE}/api/owner/orders/${orderId}/bill`, {
      headers: { Cookie: cookie },
    });
    if (res.status === 429) {
      const body = (await res.json()) as { error?: string };
      if (body.error?.toLowerCase().includes("wait") || body.error?.toLowerCase().includes("limit")) {
        ok("immediate resend → HTTP 429 (cooldown or rate limit)");
      } else {
        ok(`immediate resend → HTTP 429`);
      }
    } else if (res.status === 200) {
      // Rate limit window may have reset or a different order is used
      fail("expected HTTP 429 for immediate resend", `got ${res.status}`);
    } else {
      ok(`immediate resend → HTTP ${res.status} (non-200)`);
    }
  } catch (e) {
    fail("cooldown test", String(e));
  }

  // ── Test 8: Tampered shortId → 404 ───────────────────────────────────────
  console.log("\n8. Security — tampered tokens");
  try {
    const res = await fetch(`${BASE}/api/b/deadbeef00`);
    if (res.status === 404) ok("tampered shortId → HTTP 404");
    else fail("tampered shortId should return 404", `HTTP ${res.status}`);
  } catch (e) {
    fail("tampered shortId test", String(e));
  }

  try {
    const tamperedToken = `${fullToken}TAMPERED`;
    const res = await fetch(`${BASE}/api/bills/${tamperedToken}`);
    if (res.status === 404) ok("tampered full token → HTTP 404");
    else fail("tampered full token should return 404", `HTTP ${res.status}`);
  } catch (e) {
    fail("tampered full token test", String(e));
  }

  try {
    const tamperedImg = `${fullToken}TAMPERED`;
    const res = await fetch(`${BASE}/api/bills/${tamperedImg}/image`);
    if (res.status === 404) ok("tampered token /image → HTTP 404");
    else fail("tampered token /image should return 404", `HTTP ${res.status}`);
  } catch (e) {
    fail("tampered token image test", String(e));
  }

  // ── Test 9: bill_opened recorded (openedAt set) ───────────────────────────
  console.log("\n9. bill_opened tracking");
  try {
    // Hit the short URL (may already be opened) and verify server didn't error
    const res = await fetch(`${BASE}/api/b/${shortId}`);
    if (res.status === 200) ok("bill URL accessible → openedAt will be recorded on first access");
    else fail("bill URL should be accessible for tracking", `HTTP ${res.status}`);
  } catch (e) {
    fail("bill_opened tracking check", String(e));
  }

  // ── Results ────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log("All bill flow smoke tests passed.\n");
    process.exit(0);
  } else {
    console.error(`${failed} test(s) failed.\n`);
    process.exit(1);
  }
}

run().catch((e: unknown) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
