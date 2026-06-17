import { Router } from "express";
import { requireOwner } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { orders, sessionBills, tableSessions } from "@workspace/db";
import { eq, and, desc, ne } from "drizzle-orm";
import { emitScreenshotEvent, emitSessionScreenshotEvent } from "../lib/orderEvents";
import { getBridgeState, isBridgeManaged } from "../lib/bridgeManager";
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

async function callBridge(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method,
    headers: bridgeHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<Record<string, unknown>>;
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
    const bridgeState = getBridgeState();
    const managed = isBridgeManaged();
    if (managed && (bridgeState === "starting" || bridgeState === "restarting")) {
      res.json({ success: true, status: "initialising", bridgeStarting: true });
    } else {
      res.status(503).json({ error: "WhatsApp Bridge is not available." });
    }
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
    const bridgeState = getBridgeState();
    const managed = isBridgeManaged();

    if (managed && (bridgeState === "starting" || bridgeState === "restarting")) {
      res.json({ success: true, status: "initialising", bridgeReachable: true, bridgeStarting: true, restaurantId });
    } else {
      res.json({ success: true, status: "not_initialised", bridgeReachable: false, restaurantId });
    }
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
//
// Matching priority:
//   1. Session bill match (deterministic):
//      incoming phone === session_bill.customer_phone
//      AND session_bill.status = 'sent'
//      AND session_bill.restaurant_id = restaurantId
//      → Screenshot attached to session bill; session moves to awaiting_verification
//
//   2. Fallback — order-level match (legacy / individual orders without sessions):
//      Find latest unpaid order for that phone + restaurant
//      → Screenshot attached to the order
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

  // ── Normalize phone ────────────────────────────────────────────────────────
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

  // ── Download image from bridge URL → base64 data URL ──────────────────────
  // Bridges may send either an HTTP(S) URL to fetch, or a data: URI directly.
  let screenshotDataUrl: string;
  if (imageUrl.startsWith("data:")) {
    screenshotDataUrl = imageUrl;
    logger.debug("[whatsapp:payment-screenshot] image received as data URI — no fetch needed");
  } else {
    try {
      const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
      if (!imageRes.ok) throw new Error(`HTTP ${imageRes.status} fetching image`);
      const contentType = imageRes.headers.get("content-type") ?? "image/jpeg";
      const buffer = await imageRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      screenshotDataUrl = `data:${contentType};base64,${base64}`;
      logger.debug({ bytes: buffer.byteLength }, "[whatsapp:payment-screenshot] image downloaded and encoded");
    } catch (fetchErr) {
      logger.error(
        { imageUrl, error: (fetchErr as Error).message },
        "[whatsapp:payment-screenshot] failed to download image — aborting"
      );
      res.status(502).json({ error: "Failed to fetch image from bridge" });
      return;
    }
  }

  const now = new Date();

  // ── Priority 1: Session bill match (deterministic phone-based) ─────────────
  // Match incoming phone === session_bill.customer_phone AND status = 'sent'
  const [sessionBill] = await db
    .select()
    .from(sessionBills)
    .where(
      and(
        eq(sessionBills.restaurantId, restaurantId),
        eq(sessionBills.customerPhone, normalizedPhone),
        eq(sessionBills.status, "sent"),
      )
    )
    .orderBy(desc(sessionBills.createdAt))
    .limit(1);

  if (sessionBill) {
    // Attach screenshot to the session bill
    await db
      .update(sessionBills)
      .set({
        screenshotUrl: screenshotDataUrl,
        screenshotReceivedAt: now,
        status: "awaiting_verification",
        updatedAt: now,
      })
      .where(eq(sessionBills.id, sessionBill.id));

    // Advance session to awaiting_verification
    await db
      .update(tableSessions)
      .set({ status: "awaiting_verification", updatedAt: now })
      .where(eq(tableSessions.id, sessionBill.sessionId));

    // Fetch session for the table number (needed for SSE payload)
    const [session] = await db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, sessionBill.sessionId))
      .limit(1);

    logger.info(
      {
        event: "session_screenshot_received",
        sessionBillId: sessionBill.id,
        sessionId: sessionBill.sessionId,
        restaurantId,
        customerPhone: normalizedPhone,
      },
      "[whatsapp:payment-screenshot] screenshot attached to session bill — awaiting_verification"
    );

    emitSessionScreenshotEvent(restaurantId, {
      sessionId: sessionBill.sessionId,
      billId: sessionBill.id,
      tableNumber: session?.tableNumber ?? "?",
      billNumber: sessionBill.billNumber,
      total: sessionBill.total,
      customerPhone: normalizedPhone,
    });

    res.json({ ok: true, matched: "session_bill", sessionBillId: sessionBill.id });
    return;
  }

  // ── Priority 2: Fallback — latest unpaid order for this phone ─────────────
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
      "[whatsapp:payment-screenshot] no session bill or unpaid order found — screenshot ignored"
    );
    res.status(404).json({ error: "No matching session bill or unpaid order found for this customer" });
    return;
  }

  // Attach screenshot to order (legacy flow)
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
    "[whatsapp:payment-screenshot] screenshot attached to order (fallback) — awaiting manual verification"
  );

  emitScreenshotEvent(restaurantId, {
    orderId: order.id,
    customerPhone: normalizedPhone,
    customerName: order.customerName,
    total: order.total,
  });

  res.json({ ok: true, matched: "order", orderId: order.id });
}) as RequestHandler);

export default router;
