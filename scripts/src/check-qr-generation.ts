/**
 * check-qr-generation.ts
 *
 * Two-part QR regression check:
 *
 * PART 1 — URL generation + full round-trip encode/decode
 *   Runs the same URL-building logic as owner.ts getQrUrl() under several
 *   env-var configurations, encodes each URL into a real PNG QR code using
 *   the `qrcode` package, then decodes the PNG back to text using sharp +
 *   jsqr and asserts the round-trip is lossless and HTTPS.
 *
 * PART 2 — Scanner normalisation regression
 *   Simulates how real-world QR scanners (Google Lens, WhatsApp, Samsung
 *   Internet) mangle the restaurant-slug path parameter and verifies that
 *   normalizeRestaurantParam() always resolves to the canonical slug.
 *   Variants covered:
 *     1. trailing slash
 *     2. %0A (newline) suffix        — Google Lens
 *     3. %20 (space) suffix          — generic scanner URL corruption
 *     4. uppercase slug              — Samsung Internet
 *     5. mixed-case slug             — Samsung Internet / iOS camera
 *     6. double-encoded URL          — %252D → router decodes → %2D
 *     7. WhatsApp forwarded CRLF     — %0D%0A appended by WhatsApp link preview
 *
 * Exits 1 (failing the deploy gate) if any assertion fails.
 * Exits 0 on success.
 *
 * Usage:  tsx ./src/check-qr-generation.ts
 */

import QRCode from "qrcode";
import sharp from "sharp";
import jsQR from "jsqr";
import { normalizeRestaurantParam } from "@workspace/url-utils";

// ── Replicate owner.ts getQrUrl — single source of truth for URL shape ────────
function getQrUrl(
  restaurantSlug: string,
  tableId: number,
  env: Record<string, string | undefined>,
): string {
  const base =
    env.SITE_URL?.trim() ||
    (() => {
      const d = env.REPLIT_DOMAINS?.split(",")[0]?.trim();
      return d ? `https://${d}` : null;
    })() ||
    (env.REPLIT_DEV_DOMAIN
      ? `https://${env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:80");
  return `${base}/menu/${restaurantSlug}/table/${tableId}`;
}

// ── Part 1: env-var configurations ───────────────────────────────────────────
const SLUG = "spice-garden";
const TABLE_ID = 3;

const URL_SCENARIOS: Array<{ label: string; env: Record<string, string | undefined> }> = [
  {
    label: "SITE_URL set (custom domain — production case)",
    env: { SITE_URL: "https://bitebend.in" },
  },
  {
    label: "REPLIT_DOMAINS set (Replit hosted — no custom domain)",
    env: { REPLIT_DOMAINS: "abc123.replit.app" },
  },
  {
    label: "REPLIT_DEV_DOMAIN set (dev preview)",
    env: { REPLIT_DEV_DOMAIN: "abc123-00-xyz.sisko.replit.dev" },
  },
];

// ── Part 2: scanner normalization scenarios ───────────────────────────────────
// Each entry simulates the raw slug string the router hands to the handler
// after its own path-param extraction (Express already does one decode pass).
// "raw"      — what the handler receives as req.params.restaurantId
// "expected" — what normalizeRestaurantParam() must return for lookup to succeed
const SCANNER_SCENARIOS: Array<{
  label: string;
  raw: string;
  expected: string;
}> = [
  {
    label: "1. Trailing slash  (Google Lens / Samsung Internet)",
    raw: "spice-garden/",
    expected: SLUG,
  },
  {
    label: "2. %0A newline suffix  (Google Lens appends \\n to scanned URL)",
    // Router passes the percent-encoded form when the URL wasn't decoded by the router
    // Express URL-decodes path params, so the handler sees the literal newline:
    raw: "spice-garden\n",
    expected: SLUG,
  },
  {
    label: "3. %20 trailing space  (generic scanner URL corruption)",
    raw: "spice-garden ",
    expected: SLUG,
  },
  {
    label: "4. Uppercase slug  (Samsung Internet forces uppercase domain params)",
    raw: "SPICE-GARDEN",
    expected: SLUG,
  },
  {
    label: "5. Mixed-case slug  (iOS camera / Samsung Internet)",
    raw: "Spice-Garden",
    expected: SLUG,
  },
  {
    label: "6. Double-encoded hyphen  (scanner encodes %, router decodes once → %2D remains)",
    // Original URL: /menu/spice-garden/  — scanner encodes '-' as '%2D', then
    // percent-encodes the '%' itself to '%25', producing 'spice%252Dgarden'.
    // Browser decodes once (%25 → %) giving the handler 'spice%2Dgarden'.
    // normalizeRestaurantParam must decode that remaining %2D → '-'.
    raw: "spice%2Dgarden",
    expected: SLUG,
  },
  {
    label: "7. WhatsApp forwarded CRLF  (WhatsApp link preview appends \\r\\n)",
    // WhatsApp wraps URLs in a redirect; some versions append CRLF to the slug.
    // Express decodes the path and the handler sees literal \r\n.
    raw: "spice-garden\r\n",
    expected: SLUG,
  },
];

// ── Encode URL → PNG buffer using qrcode ─────────────────────────────────────
async function encodeQR(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    QRCode.toBuffer(
      url,
      { type: "png", width: 300, margin: 4, errorCorrectionLevel: "H" },
      (err: Error | null | undefined, buf: Buffer) => {
        if (err) reject(err);
        else resolve(buf);
      },
    );
  });
}

// ── Decode PNG buffer → URL string using sharp + jsqr ────────────────────────
async function decodeQR(pngBuf: Buffer): Promise<string | null> {
  const { data, info } = await sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const code = jsQR(
    new Uint8ClampedArray(data.buffer),
    info.width,
    info.height,
  );
  return code?.data ?? null;
}

// ── Assertions ────────────────────────────────────────────────────────────────
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: URL generation + QR round-trip
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── PART 1: URL generation + QR round-trip ───────────────────────────\n");

for (const { label, env } of URL_SCENARIOS) {
  const generatedUrl = getQrUrl(SLUG, TABLE_ID, env);
  const expectedSuffix = `/menu/${SLUG}/table/${TABLE_ID}`;

  process.stdout.write(`  ${label}\n`);
  process.stdout.write(`  URL: ${generatedUrl}\n`);

  try {
    assert(
      !generatedUrl.startsWith("http://"),
      `URL must not use plain HTTP — got: ${generatedUrl}`,
    );
    assert(
      generatedUrl.startsWith("https://"),
      `URL must start with https:// — got: ${generatedUrl}`,
    );
    assert(
      generatedUrl.includes("/menu/"),
      `URL must contain /menu/ — got: ${generatedUrl}`,
    );
    assert(
      generatedUrl.endsWith(expectedSuffix),
      `URL must end with "${expectedSuffix}" — got: ${generatedUrl}`,
    );

    const pngBuf = await encodeQR(generatedUrl);
    assert(pngBuf.length > 0, "QR PNG buffer must be non-empty");

    const decoded = await decodeQR(pngBuf);
    assert(decoded !== null, "QR decode returned null — unreadable QR");
    assert(
      decoded === generatedUrl,
      `Round-trip mismatch:\n    encoded : ${generatedUrl}\n    decoded : ${decoded}`,
    );
    assert(
      !decoded!.startsWith("http://"),
      `Decoded URL must not use plain HTTP — got: ${decoded}`,
    );

    console.log(`  ✓ PASS\n`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL — ${(err as Error).message}\n`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: Scanner normalisation regression
// ─────────────────────────────────────────────────────────────────────────────
console.log("── PART 2: Scanner normalisation regression ─────────────────────────\n");

for (const { label, raw, expected } of SCANNER_SCENARIOS) {
  process.stdout.write(`  ${label}\n`);
  process.stdout.write(`  Input : ${JSON.stringify(raw)}\n`);

  try {
    const normalized = normalizeRestaurantParam(raw);

    assert(
      normalized === expected,
      `normalizeRestaurantParam(${JSON.stringify(raw)}) → ${JSON.stringify(normalized)}, want ${JSON.stringify(expected)}`,
    );
    assert(
      normalized.length > 0,
      `Normalized slug must not be empty — input: ${JSON.stringify(raw)}`,
    );
    assert(
      normalized === normalized.toLowerCase(),
      `Normalized slug must be all lowercase — got: ${JSON.stringify(normalized)}`,
    );
    assert(
      !normalized.endsWith("/"),
      `Normalized slug must not end with '/' — got: ${JSON.stringify(normalized)}`,
    );
    assert(
      normalized === normalized.trim(),
      `Normalized slug must have no surrounding whitespace — got: ${JSON.stringify(normalized)}`,
    );

    process.stdout.write(`  Output: ${JSON.stringify(normalized)}\n`);
    console.log(`  ✓ PASS\n`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL — ${(err as Error).message}\n`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("────────────────────────────────────────────────────────────────────");

const total = URL_SCENARIOS.length + SCANNER_SCENARIOS.length;

if (failed > 0) {
  console.error(
    `\n[check:qr-generation] FAILED — ${failed}/${total} scenario(s) failed.\n`,
  );
  process.exit(1);
} else {
  console.log(
    `\n[check:qr-generation] ✓ All ${passed}/${total} scenario(s) passed — QR URLs and scanner normalisation are correct.\n`,
  );
  process.exit(0);
}
