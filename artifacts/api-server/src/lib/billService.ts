import { createHmac, randomBytes, randomUUID } from "crypto";
import { db, billLinks, imageBlobs, orders, restaurants } from "@workspace/db";
import { eq, and, gte, count, max, lt } from "drizzle-orm";
import { logger } from "./logger";

const MAX_SENDS_PER_ORDER = 5;
const COOLDOWN_MS = 60 * 1000;  // 60 seconds between sends
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Errors ───────────────────────────────────────────────────────────────────

export class BillRateLimitError extends Error {
  constructor() {
    super(`Bill already sent ${MAX_SENDS_PER_ORDER} times for this order. Limit resets after 24 h.`);
    this.name = "BillRateLimitError";
    Object.setPrototypeOf(this, BillRateLimitError.prototype);
  }
}

export class BillCooldownError extends Error {
  readonly secondsRemaining: number;
  constructor(secondsRemaining: number) {
    super(`Please wait ${secondsRemaining} seconds before sending again.`);
    this.name = "BillCooldownError";
    this.secondsRemaining = secondsRemaining;
    Object.setPrototypeOf(this, BillCooldownError.prototype);
  }
}

// ─── HMAC helpers ─────────────────────────────────────────────────────────────

function getSecret(): string {
  return process.env["SESSION_SECRET"] ?? "dev-fallback-secret";
}

function computeHmac(id: string, orderId: number, expiresAt: Date): string {
  const payload = `${id}:${orderId}:${expiresAt.toISOString()}`;
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function parseToken(token: string): { id: string; sig: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  return { id: token.slice(0, dot), sig: token.slice(dot + 1) };
}

function generateShortId(): string {
  return randomBytes(5).toString("hex"); // 10 lowercase hex chars
}

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Persist a bill PNG to the DB and return a signed public token.
 * Throws BillRateLimitError when the order has exceeded MAX_SENDS_PER_ORDER.
 * Throws BillCooldownError when the last send was within 60 seconds.
 */
export async function storeBill(
  png: Buffer,
  orderId: number,
  restaurantId: number,
): Promise<{ token: string; shortId: string }> {
  const windowStart = new Date(Date.now() - TTL_MS);

  const [{ total, latest }] = await db
    .select({ total: count(), latest: max(billLinks.createdAt) })
    .from(billLinks)
    .where(and(eq(billLinks.orderId, orderId), gte(billLinks.createdAt, windowStart)));

  if (Number(total) >= MAX_SENDS_PER_ORDER) {
    logger.warn({ orderId, restaurantId }, "bill_send_blocked: rate limit exceeded");
    throw new BillRateLimitError();
  }

  if (latest) {
    const elapsed = Date.now() - latest.getTime();
    if (elapsed < COOLDOWN_MS) {
      const secondsRemaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      logger.warn({ orderId, restaurantId, secondsRemaining }, "bill_send_blocked: cooldown active");
      throw new BillCooldownError(secondsRemaining);
    }
  }

  const expiresAt = new Date(Date.now() + TTL_MS);
  const id = randomUUID();
  const hmac = computeHmac(id, orderId, expiresAt);
  const shortId = generateShortId();

  const [blob] = await db
    .insert(imageBlobs)
    .values({ data: png.toString("base64"), contentType: "image/png" })
    .returning({ id: imageBlobs.id });

  await db.insert(billLinks).values({
    id,
    orderId,
    imageBlobId: blob.id,
    hmacSignature: hmac,
    shortId,
    expiresAt,
  });

  logger.info({ orderId, restaurantId, shortId }, "bill_generated");

  return { token: `${id}.${hmac}`, shortId };
}

// ─── Retrieve ─────────────────────────────────────────────────────────────────

export type BillContext = {
  orderId: number;
  restaurantName: string;
  tableNumber: string | null;
  token: string;
  shortId: string;
};

export type BillResult =
  | { status: "ok"; png: Buffer; context: BillContext }
  | { status: "expired"; context: BillContext }
  | { status: "notFound" };

async function resolveBillContext(
  link: { id: string; orderId: number; expiresAt: Date; hmacSignature: string; imageBlobId: string; shortId: string; openedAt: Date | null },
  sig: string,
): Promise<BillResult> {
  // HMAC verification
  const expected = computeHmac(link.id, link.orderId, link.expiresAt);
  if (sig !== expected) return { status: "notFound" };

  const contextBase = async (): Promise<BillContext> => {
    const [orderRow] = await db
      .select({ restaurantId: orders.restaurantId, tableNumber: orders.tableNumber })
      .from(orders)
      .where(eq(orders.id, link.orderId))
      .limit(1);

    const restaurantName = orderRow
      ? await db
          .select({ name: restaurants.name })
          .from(restaurants)
          .where(eq(restaurants.id, orderRow.restaurantId))
          .limit(1)
          .then(([r]) => r?.name ?? "the restaurant")
      : "the restaurant";

    return {
      orderId: link.orderId,
      restaurantName,
      tableNumber: orderRow?.tableNumber ?? null,
      token: `${link.id}.${link.hmacSignature}`,
      shortId: link.shortId,
    };
  };

  if (link.expiresAt < new Date()) {
    const context = await contextBase();
    logger.info({ orderId: link.orderId, shortId: link.shortId }, "bill_expired: customer hit expired link");
    return { status: "expired", context };
  }

  const [blob] = await db
    .select({ data: imageBlobs.data })
    .from(imageBlobs)
    .where(eq(imageBlobs.id, link.imageBlobId))
    .limit(1);

  if (!blob) return { status: "notFound" };

  // Record first open (best-effort, non-blocking)
  if (!link.openedAt) {
    db.update(billLinks)
      .set({ openedAt: new Date() })
      .where(eq(billLinks.id, link.id))
      .then(() => {
        logger.info({ orderId: link.orderId, shortId: link.shortId }, "bill_opened");
      })
      .catch(() => void 0);
  }

  const context = await contextBase();
  return { status: "ok", png: Buffer.from(blob.data, "base64"), context };
}

export async function getBillByToken(token: string): Promise<BillResult> {
  const parts = parseToken(token);
  if (!parts) return { status: "notFound" };

  const [link] = await db
    .select({
      id: billLinks.id,
      expiresAt: billLinks.expiresAt,
      hmacSignature: billLinks.hmacSignature,
      imageBlobId: billLinks.imageBlobId,
      orderId: billLinks.orderId,
      shortId: billLinks.shortId,
      openedAt: billLinks.openedAt,
    })
    .from(billLinks)
    .where(eq(billLinks.id, parts.id))
    .limit(1);

  if (!link) return { status: "notFound" };
  return resolveBillContext(link, parts.sig);
}

export async function getBillByShortId(shortId: string): Promise<BillResult> {
  const [link] = await db
    .select({
      id: billLinks.id,
      expiresAt: billLinks.expiresAt,
      hmacSignature: billLinks.hmacSignature,
      imageBlobId: billLinks.imageBlobId,
      orderId: billLinks.orderId,
      shortId: billLinks.shortId,
      openedAt: billLinks.openedAt,
    })
    .from(billLinks)
    .where(eq(billLinks.shortId, shortId))
    .limit(1);

  if (!link) return { status: "notFound" };
  return resolveBillContext(link, link.hmacSignature);
}

// ─── Transport abstraction ────────────────────────────────────────────────────

export interface BillPayload {
  customerName: string;
  customerPhone: string;
  restaurantName: string;
  tableNumber: string | null;
  orderId: number;
  total: number;
  upiId: string | null;
  billUrl: string; // short URL shown in message
}

export interface SendResult {
  whatsappUrl: string;
  message: string;
}

/**
 * WhatsApp deep-link transport (current provider).
 *
 * To add a new provider (Interakt, WATI, Meta Cloud API):
 *   1. Create a new function with the same (BillPayload) => SendResult signature
 *   2. Swap the import in owner.ts
 *   3. The route handler and Dashboard never change
 */
export function sendPaymentBill(payload: BillPayload): SendResult {
  const { customerName, customerPhone, restaurantName, tableNumber, orderId, total, billUrl } = payload;

  const rawPhone = customerPhone.replace(/\D/g, "");
  const phone =
    rawPhone.startsWith("91") && rawPhone.length === 12
      ? rawPhone
      : rawPhone.length === 10
        ? `91${rawPhone}`
        : rawPhone;

  const tableText = tableNumber ? `Table: ${tableNumber}\n` : "";

  const message = [
    `Hi ${customerName},`,
    ``,
    `Please complete payment for your order at ${restaurantName}.`,
    ``,
    `${tableText}Order: #${orderId}`,
    `Amount: \u20B9${total}`,
    ``,
    `Payment Bill:`,
    billUrl,
    ``,
    `Scan the QR code in the bill to pay instantly — the amount is already pre-filled.`,
    ``,
    `Thank you.`,
  ].join("\n");

  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  return { whatsappUrl, message };
}

// ─── Cleanup job ──────────────────────────────────────────────────────────────

/**
 * Delete expired bill links and their associated imageBlobs.
 * Called once on startup, then every 24 h via setInterval in index.ts.
 */
export async function purgeExpiredBills(): Promise<void> {
  const now = new Date();

  const expiredLinks = await db
    .select({ imageBlobId: billLinks.imageBlobId })
    .from(billLinks)
    .where(lt(billLinks.expiresAt, now));

  if (expiredLinks.length === 0) return;

  await db.delete(billLinks).where(lt(billLinks.expiresAt, now));

  for (const { imageBlobId } of expiredLinks) {
    await db.delete(imageBlobs).where(eq(imageBlobs.id, imageBlobId)).catch(() => void 0);
  }

  logger.info({ count: expiredLinks.length }, "bill_cleanup: purged expired bills");
}
