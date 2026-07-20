import { Router } from "express";
import { requireOwner } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { sessionBills, tableSessions } from "@workspace/db";
import { eq, and, or, desc, gte } from "drizzle-orm";
import { emitSessionScreenshotEvent } from "../lib/orderEvents";
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
    // [debug:qr] Log what the bridge returned and what we're forwarding to the portal
    logger.debug(
      { restaurantId, bridgeResponse: { success: data.success, status: data.status }, bridgeReachable: true },
      "[whatsapp:status] bridge responded"
    );
    res.json({ ...data, bridgeReachable: true });
  } catch {
    const bridgeState = getBridgeState();
    const managed = isBridgeManaged();

    if (managed && (bridgeState === "starting" || bridgeState === "restarting")) {
      logger.debug({ restaurantId, bridgeState }, "[whatsapp:status] bridge unreachable — returning initialising");
      res.json({ success: true, status: "initialising", bridgeReachable: true, bridgeStarting: true, restaurantId });
    } else {
      logger.debug({ restaurantId, bridgeState, managed }, "[whatsapp:status] bridge unreachable — returning not_initialised");
      res.json({ success: true, status: "not_initialised", bridgeReachable: false, restaurantId });
    }
  }
};

// ── Owner: get QR status (REST poll fallback) ─────────────────────────────────
const qrStatusHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) {
    res.status(400).json({ error: "No restaurant associated with this account" });
    return;
  }
  try {
    const data = await callBridge(`/api/whatsapp/qr-status/${restaurantId}`, "GET");
    res.json(data);
  } catch {
    // Bridge unreachable — return a safe null-QR response so the frontend can
    // keep polling without throwing an error.
    res.json({
      success: true,
      restaurantId,
      status: "not_initialised",
      qr: null,
      generatedAt: null,
      expiresAt: null,
    });
  }
};

router.post("/owner/whatsapp/connect",    requireOwner, connectHandler);
router.post("/owner/whatsapp/disconnect", requireOwner, disconnectHandler);
router.get("/owner/whatsapp/status",      requireOwner, statusHandler);
router.get("/owner/whatsapp/qr-status",   requireOwner, qrStatusHandler);

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
    // ── LID / unresolvable phone fallback ───────────────────────────────────
    // WhatsApp's newer linked-device architecture can deliver msg.from as an
    // @lid JID (e.g. "268641748652129@lid").  whatsapp-web.js contact.number
    // returns the LID digits, not the real phone — so Indian-pattern normali-
    // sation always fails for these senders.
    //
    // Fallback: if exactly ONE session bill is in 'sent' status for this
    // restaurant, the incoming image is unambiguously from that customer.
    // Resolve their phone from the bill and continue the normal flow.
    // If there are zero or multiple pending bills we cannot safely assign the
    // screenshot and return 422 as before.
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const pendingBills = await db
      .select({ id: sessionBills.id, customerPhone: sessionBills.customerPhone, sentAt: sessionBills.sentAt })
      .from(sessionBills)
      .where(
        and(
          eq(sessionBills.restaurantId, restaurantId),
          eq(sessionBills.status, "sent"),
          gte(sessionBills.sentAt, thirtyMinutesAgo),
        )
      )
      .limit(2);

    logger.info(
      { customerPhone, restaurantId, pendingBillCount: pendingBills.length, windowMinutes: 30 },
      "[whatsapp:payment-screenshot:fallback] queried recent sent bills"
    );

    if (pendingBills.length === 1) {
      const bill = pendingBills[0];
      normalizedPhone = bill.customerPhone;
      logger.info(
        {
          customerPhone,
          resolvedTo: normalizedPhone,
          sessionBillId: bill.id,
          sentAt: bill.sentAt,
          fallbackAccepted: true,
        },
        "[whatsapp:payment-screenshot:fallback] accepted — exactly 1 recent pending bill, phone resolved"
      );
    } else {
      logger.warn(
        {
          customerPhone,
          restaurantId,
          pendingBillCount: pendingBills.length,
          windowMinutes: 30,
          fallbackAccepted: false,
          reason: pendingBills.length === 0 ? "no_recent_pending_bills" : "multiple_pending_bills",
        },
        "[whatsapp:payment-screenshot:fallback] rejected — cannot safely assign screenshot"
      );
      res.status(422).json({ error: "Could not normalize phone number" });
      return;
    }
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
  // ROOT CAUSE OF MISSING SCREENSHOTS:
  //   WhatsApp always delivers msg.from with the full country-code prefix
  //   (e.g. "917086670033").  But customers typically type their 10-digit
  //   number on the menu ("7086670033"), which is what gets stored in
  //   session_bills.customer_phone.  An exact-string match always failed.
  //
  // FIX: derive the 10-digit sibling of the normalised 12-digit phone and
  //   match either form.  sendSessionBill now also canonicalises before
  //   storing, so future bills will match on the 12-digit form; the 10-digit
  //   OR arm handles existing/legacy bills.
  const phone10 =
    normalizedPhone?.length === 12 && normalizedPhone.startsWith("91")
      ? normalizedPhone.slice(2)   // "917086670033" → "7086670033"
      : null;

  const [sessionBill] = await db
    .select()
    .from(sessionBills)
    .where(
      and(
        eq(sessionBills.restaurantId, restaurantId),
        or(
          eq(sessionBills.customerPhone, normalizedPhone ?? ""),
          ...(phone10 ? [eq(sessionBills.customerPhone, phone10)] : []),
        ),
        eq(sessionBills.status, "sent"),
      )
    )
    .orderBy(desc(sessionBills.createdAt))
    .limit(1);

  if (sessionBill) {
    // Attach screenshot to the session bill (phones matched — normal flow)
    await db
      .update(sessionBills)
      .set({
        screenshotUrl: screenshotDataUrl,
        screenshotReceivedAt: now,
        senderPhone: normalizedPhone,
        phoneMismatch: false,
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
      customerPhone: normalizedPhone ?? "",
    });

    res.json({ ok: true, matched: "session_bill", sessionBillId: sessionBill.id });
    return;
  }

  // ── Priority 1.5: Phone mismatch — screenshot from wrong phone ────────────
  // A screenshot arrived from a phone that does NOT match any 'sent' bill.
  // If exactly one 'sent' bill exists for this restaurant in the last 30 min,
  // we can safely attach the screenshot with phone_mismatch=true, send an
  // auto-reply to the sender, and let staff handle it via the warning UI.
  // If zero or multiple bills are pending we cannot assign the screenshot.
  {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const sentBills = await db
      .select()
      .from(sessionBills)
      .where(
        and(
          eq(sessionBills.restaurantId, restaurantId),
          eq(sessionBills.status, "sent"),
          gte(sessionBills.sentAt, thirtyMinutesAgo),
        )
      )
      .orderBy(desc(sessionBills.createdAt))
      .limit(2);

    if (sentBills.length === 1) {
      const mismatchBill = sentBills[0]!;

      await db
        .update(sessionBills)
        .set({
          screenshotUrl: screenshotDataUrl,
          screenshotReceivedAt: now,
          senderPhone: normalizedPhone,
          phoneMismatch: true,
          status: "awaiting_verification",
          updatedAt: now,
        })
        .where(eq(sessionBills.id, mismatchBill.id));

      await db
        .update(tableSessions)
        .set({ status: "awaiting_verification", updatedAt: now })
        .where(eq(tableSessions.id, mismatchBill.sessionId));

      // Auto-reply to the sender's phone
      const replyMessage =
        "The phone number used to send this payment proof does not match the phone number used to place the order.\n\nPlease resend the payment proof from the original ordering phone number.";
      try {
        await fetch(`${BRIDGE_URL}/api/send-message`, {
          method: "POST",
          headers: bridgeHeaders(),
          body: JSON.stringify({ restaurantId, phone: normalizedPhone, message: replyMessage }),
          signal: AbortSignal.timeout(8000),
        });
        logger.info(
          { restaurantId, senderPhone: normalizedPhone },
          "[whatsapp:payment-screenshot:mismatch] auto-reply sent to sender"
        );
      } catch (replyErr) {
        logger.warn(
          { error: (replyErr as Error).message },
          "[whatsapp:payment-screenshot:mismatch] auto-reply failed — continuing"
        );
      }

      logger.warn(
        {
          event: "session_screenshot_phone_mismatch",
          sessionBillId: mismatchBill.id,
          sessionId: mismatchBill.sessionId,
          restaurantId,
          expectedPhone: mismatchBill.customerPhone,
          senderPhone: normalizedPhone,
        },
        "[whatsapp:payment-screenshot] phone mismatch — screenshot stored, approval blocked"
      );

      // Fetch session for SSE payload
      const [mismatchSession] = await db
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.id, mismatchBill.sessionId))
        .limit(1);

      emitSessionScreenshotEvent(restaurantId, {
        sessionId: mismatchBill.sessionId,
        billId: mismatchBill.id,
        tableNumber: mismatchSession?.tableNumber ?? "?",
        billNumber: mismatchBill.billNumber,
        total: mismatchBill.total,
        customerPhone: mismatchBill.customerPhone ?? normalizedPhone ?? "",
      });

      res.json({ ok: true, matched: "session_bill_mismatch", sessionBillId: mismatchBill.id });
      return;
    }

    logger.info(
      { restaurantId, senderPhone: normalizedPhone, pendingBillCount: sentBills.length },
      "[whatsapp:payment-screenshot:mismatch] cannot assign — skipping to order fallback"
    );
  }

  // ── No matching sent bill — screenshot is unmatched, log and discard ─────────
  // A screenshot arrived but there is no session bill in 'sent' status that can
  // receive it (zero or multiple pending bills, and no phone match).
  // We do NOT attach it to any order.
  logger.warn(
    {
      event: "screenshot_unmatched",
      restaurantId,
      senderPhone: normalizedPhone,
      reason: "no_sent_bill_to_match",
    },
    "[whatsapp:payment-screenshot] screenshot discarded — no matching 'sent' session bill found"
  );
  res.json({ ok: true, matched: "none", reason: "no_sent_bill_to_match" });
}) as RequestHandler);

export default router;
