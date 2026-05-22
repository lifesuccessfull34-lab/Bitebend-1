import { createHmac, randomUUID } from "crypto";
import { db, billLinks, imageBlobs, orders, restaurants } from "@workspace/db";
import { eq, and, gte, count, lt } from "drizzle-orm";

const MAX_SENDS_PER_ORDER = 5;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Errors ───────────────────────────────────────────────────────────────────

export class BillRateLimitError extends Error {
  constructor() {
    super(`Bill already sent ${MAX_SENDS_PER_ORDER} times for this order. Limit resets after 24 h.`);
    this.name = "BillRateLimitError";
    Object.setPrototypeOf(this, BillRateLimitError.prototype);
  }
}

export class BillExpiredError extends Error {
  readonly orderId: number;
  constructor(orderId: number) {
    super("Bill link has expired");
    this.name = "BillExpiredError";
    this.orderId = orderId;
    Object.setPrototypeOf(this, BillExpiredError.prototype);
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

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Persist a bill PNG to the DB and return a signed public token.
 * Throws BillRateLimitError when the order has already been billed
 * MAX_SENDS_PER_ORDER times in the current 24-hour window.
 */
export async function storeBill(png: Buffer, orderId: number): Promise<string> {
  const windowStart = new Date(Date.now() - TTL_MS);
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(billLinks)
    .where(
      and(
        eq(billLinks.orderId, orderId),
        gte(billLinks.createdAt, windowStart),
      ),
    );

  if (Number(existing) >= MAX_SENDS_PER_ORDER) {
    throw new BillRateLimitError();
  }

  const expiresAt = new Date(Date.now() + TTL_MS);
  const id = randomUUID();
  const hmac = computeHmac(id, orderId, expiresAt);

  // Store the PNG as base64 in imageBlobs (same mechanism as dish photos)
  const [blob] = await db
    .insert(imageBlobs)
    .values({ data: png.toString("base64"), contentType: "image/png" })
    .returning({ id: imageBlobs.id });

  await db.insert(billLinks).values({
    id,
    orderId,
    imageBlobId: blob.id,
    hmacSignature: hmac,
    expiresAt,
  });

  return `${id}.${hmac}`;
}

// ─── Retrieve ─────────────────────────────────────────────────────────────────

export type BillResult =
  | { status: "ok"; png: Buffer }
  | { status: "expired"; orderId: number; restaurantName: string; tableNumber: string | null }
  | { status: "notFound" };

/**
 * Retrieve a bill by its signed token.
 * Returns a discriminated union so the caller can return the right HTTP status.
 */
export async function getBillByToken(token: string): Promise<BillResult> {
  const parts = parseToken(token);
  if (!parts) return { status: "notFound" };

  const [link] = await db
    .select({
      expiresAt: billLinks.expiresAt,
      hmacSignature: billLinks.hmacSignature,
      imageBlobId: billLinks.imageBlobId,
      orderId: billLinks.orderId,
    })
    .from(billLinks)
    .where(eq(billLinks.id, parts.id))
    .limit(1);

  if (!link) return { status: "notFound" };

  // Constant-time-ish HMAC comparison via recompute
  const expected = computeHmac(parts.id, link.orderId, link.expiresAt);
  if (parts.sig !== expected) return { status: "notFound" };

  if (link.expiresAt < new Date()) {
    // Fetch enough context for the fallback page
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
      status: "expired",
      orderId: link.orderId,
      restaurantName,
      tableNumber: orderRow?.tableNumber ?? null,
    };
  }

  const [blob] = await db
    .select({ data: imageBlobs.data })
    .from(imageBlobs)
    .where(eq(imageBlobs.id, link.imageBlobId))
    .limit(1);

  if (!blob) return { status: "notFound" };

  return { status: "ok", png: Buffer.from(blob.data, "base64") };
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
  billUrl: string;
}

export interface SendResult {
  whatsappUrl: string;
  message: string;
}

/**
 * WhatsApp deep-link transport (current provider).
 *
 * When a WhatsApp Business API provider is added (Interakt, WATI, Meta Cloud),
 * create a new function with the same BillPayload → SendResult signature and
 * swap the import in the route. The route itself stays unchanged.
 */
export function sendPaymentBill(payload: BillPayload): SendResult {
  const {
    customerName,
    customerPhone,
    restaurantName,
    tableNumber,
    orderId,
    total,
    billUrl,
  } = payload;

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
 * Run once per day (called from server startup via setInterval).
 */
export async function purgeExpiredBills(): Promise<number> {
  const now = new Date();

  // Fetch expired imageBlob IDs before deleting links
  const expiredLinks = await db
    .select({ imageBlobId: billLinks.imageBlobId })
    .from(billLinks)
    .where(lt(billLinks.expiresAt, now));

  if (expiredLinks.length === 0) return 0;

  // Delete links first (FK constraint satisfied by cascade, but explicit is fine)
  await db.delete(billLinks).where(lt(billLinks.expiresAt, now));

  // Delete orphaned blobs (blobs that were only used by bill_links)
  for (const { imageBlobId } of expiredLinks) {
    await db.delete(imageBlobs).where(eq(imageBlobs.id, imageBlobId));
  }

  return expiredLinks.length;
}
