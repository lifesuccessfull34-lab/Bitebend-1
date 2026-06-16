import { Router } from "express";
import { requireOwner } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { orders } from "@workspace/db";
import { eq, and, desc, ne } from "drizzle-orm";
import { emitOrderEvent } from "../lib/orderEvents";
import type { RequestHandler } from "express";

const router = Router();

const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://localhost:3001";
const BRIDGE_API_SECRET = process.env.BRIDGE_API_SECRET ?? "";
const BITEBEND_WEBHOOK_SECRET = process.env.BITEBEND_WEBHOOK_SECRET ?? "";

function bridgeHeaders() {
  return {
    "Content-Type": "application/json",
    ...(BRIDGE_API_SECRET ? { "x-bridge-secret": BRIDGE_API_SECRET } : {}),
  };
}

async function callBridge(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method,
    headers: bridgeHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Owner: trigger WhatsApp QR / connect ──────────────────────────────────────
const connectHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) {
    res.status(400).json({ error: "No restaurant associated with this account" });
    return;
  }
  try {
    const data = await callBridge("/api/whatsapp/connect", "POST", { restaurantId });
    res.json(data);
  } catch {
    res.status(503).json({ error: "WhatsApp Bridge unreachable. Make sure the bridge service is running." });
  }
};

// ── Owner: disconnect ─────────────────────────────────────────────────────────
const disconnectHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) {
    res.status(400).json({ error: "No restaurant associated with this account" });
    return;
  }
  try {
    const data = await callBridge("/api/whatsapp/disconnect", "POST", { restaurantId });
    res.json(data);
  } catch {
    res.status(503).json({ error: "WhatsApp Bridge unreachable" });
  }
};

// ── Owner: get current status ─────────────────────────────────────────────────
const statusHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) {
    res.status(400).json({ error: "No restaurant associated with this account" });
    return;
  }
  try {
    const data = await callBridge(`/api/whatsapp/status/${restaurantId}`, "GET");
    res.json({ ...data, bridgeReachable: true });
  } catch {
    res.status(200).json({ success: true, status: "not_initialised", bridgeReachable: false, restaurantId });
  }
};

router.post("/owner/whatsapp/connect",    requireOwner, connectHandler);
router.post("/owner/whatsapp/disconnect", requireOwner, disconnectHandler);
router.get("/owner/whatsapp/status",      requireOwner, statusHandler);

// ── Incoming webhook from the bridge (general messages) ───────────────────────
router.post("/whatsapp/incoming", ((req, res) => {
  const secret = req.headers["x-webhook-secret"];
  if (BITEBEND_WEBHOOK_SECRET && secret !== BITEBEND_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { restaurantId, customerPhone, messageType, text, imageUrl, timestamp } = req.body as {
    restaurantId: number;
    customerPhone: string;
    messageType: string;
    text?: string;
    imageUrl?: string;
    timestamp: string;
  };

  logger.info(
    { restaurantId, customerPhone, messageType, timestamp },
    "[whatsapp:incoming] message received"
  );

  void text; void imageUrl;

  res.json({ ok: true });
}) as RequestHandler);

// ── Payment screenshot webhook from the bridge ────────────────────────────────
// Called when a customer sends an image via WhatsApp.
// Finds the latest unpaid order for that phone, stores the screenshot,
// and marks it as awaiting manual verification.
router.post("/whatsapp/payment-screenshot", (async (req, res) => {
  const secret = req.headers["x-webhook-secret"];
  if (BITEBEND_WEBHOOK_SECRET && secret !== BITEBEND_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { restaurantId, customerPhone, imageUrl, timestamp } = req.body as {
    restaurantId: number;
    customerPhone: string;
    imageUrl: string;
    timestamp: string;
  };

  if (!restaurantId || !customerPhone || !imageUrl) {
    res.status(400).json({ error: "restaurantId, customerPhone and imageUrl are required" });
    return;
  }

  logger.info(
    { restaurantId, customerPhone, imageUrl, timestamp },
    "[whatsapp:payment-screenshot] screenshot received"
  );

  // ── Normalize phone: strip non-digits, ensure 91 prefix ──
  // WhatsApp delivers phone as "919876543210" (12 digits, starts with 91).
  // Orders are stored after normalizePhone() which also produces "919876543210".
  const digits = customerPhone.replace(/\D/g, "").replace(/^0+/, "");
  let normalizedPhone: string | null = null;
  if (digits.length === 10) normalizedPhone = `91${digits}`;
  else if (digits.length === 12 && digits.startsWith("91")) normalizedPhone = digits;
  else if (digits.length === 11 && digits.startsWith("0")) normalizedPhone = `91${digits.slice(1)}`;

  if (!normalizedPhone) {
    logger.warn({ customerPhone }, "[whatsapp:payment-screenshot] could not normalize phone — skipping");
    res.status(422).json({ error: "Could not normalize phone number" });
    return;
  }

  // ── Find latest unpaid order for this restaurant + phone ──
  const [order] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        eq(orders.customerPhone, normalizedPhone),
        ne(orders.paymentStatus, "paid"),
      )
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (!order) {
    logger.warn(
      { restaurantId, normalizedPhone },
      "[whatsapp:payment-screenshot] no unpaid order found for phone — screenshot ignored"
    );
    res.status(404).json({ error: "No unpaid order found for this customer" });
    return;
  }

  // ── Download image from bridge URL and convert to base64 data URL ──
  // The bridge serves uploaded images at http://localhost:3001/uploads/<filename>.
  // We convert to a data URL so the portal can display it inline without needing
  // direct access to the bridge's internal port.
  let screenshotDataUrl: string;
  try {
    const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!imageRes.ok) {
      throw new Error(`HTTP ${imageRes.status} fetching image`);
    }
    const contentType = imageRes.headers.get("content-type") ?? "image/jpeg";
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    screenshotDataUrl = `data:${contentType};base64,${base64}`;
    logger.debug(
      { orderId: order.id, bytes: buffer.byteLength },
      "[whatsapp:payment-screenshot] image downloaded and encoded"
    );
  } catch (fetchErr) {
    logger.error(
      { imageUrl, error: (fetchErr as Error).message },
      "[whatsapp:payment-screenshot] failed to download image — aborting"
    );
    res.status(502).json({ error: "Failed to fetch image from bridge" });
    return;
  }

  // ── Attach screenshot to order ──
  const now = new Date();
  await db
    .update(orders)
    .set({
      paymentScreenshotUrl: screenshotDataUrl,
      paymentVerificationStatus: "manual_review",
      paymentStatus: "awaiting_verification",
      verificationMethod: null,
      updatedAt: now,
    })
    .where(eq(orders.id, order.id));

  logger.info(
    {
      event: "whatsapp_screenshot_received",
      orderId: order.id,
      restaurantId,
      customerPhone: normalizedPhone,
    },
    "[whatsapp:payment-screenshot] screenshot attached to order — awaiting manual verification"
  );

  // ── Emit SSE event so the portal refreshes immediately ──
  emitOrderEvent(restaurantId, {
    id: order.id,
    customerName: order.customerName,
    tableNumber: order.tableNumber,
    total: order.total,
    itemCount: 0,
  });

  res.json({ ok: true, orderId: order.id });
}) as RequestHandler);

export default router;
