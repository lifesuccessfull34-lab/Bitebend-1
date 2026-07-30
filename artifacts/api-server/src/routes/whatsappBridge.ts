import { createHash } from "node:crypto";
import { Router } from "express";
import { requireOwner } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { emitSessionScreenshotEvent, emitScreenshotInboxEvent } from "../lib/orderEvents";
import { getBridgeState, isBridgeManaged } from "../lib/bridgeManager";
import { matchAndAttachScreenshot } from "../lib/screenshotMatcher";
import { db, paymentScreenshotInbox } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
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
// Full matching algorithm lives in lib/screenshotMatcher.ts (DB layer, locking)
// and lib/screenshotMatchDecider.ts (pure decision function, unit-tested).
//
// Priority order:
//   P0  conversation_mapping  chatJid exact match            deterministic
//   P1  phone_match           normalised phone, 1 result     deterministic
//   P1  ambiguous             normalised phone, 2+ results   → discard
//   P1.5 phone_mismatch       phone 0 matches, senderJid     heuristic
//                             absent, 1 recent pending       (backward compat)
//   P2  lid_single_pending    phone absent, senderJid        heuristic
//                             absent, 1 recent pending       (backward compat)
//   —   discard               everything else
//
// Race safety: all SELECT + UPDATE run inside a DB transaction with
// SELECT … FOR UPDATE SKIP LOCKED — simultaneous deliveries of the same
// screenshot cannot double-attach to the same bill.
router.post("/whatsapp/payment-screenshot", (async (req, res) => {
  const secret = req.headers["x-webhook-secret"];
  if (BITEBEND_WEBHOOK_SECRET && secret !== BITEBEND_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { restaurantId, customerPhone, imageUrl, timestamp, senderJid } = req.body as {
    restaurantId: number;
    customerPhone: string;
    imageUrl: string;
    timestamp: string;
    /**
     * Raw msg.from from the bridge (e.g. "917086670033@c.us" or "268641748652129@lid").
     * Present in bridge versions that support the conversation-mapping feature.
     * Used for Priority 0 deterministic matching against session_bills.chat_jid.
     */
    senderJid?: string;
  };

  if (!restaurantId || !customerPhone || !imageUrl) {
    res.status(400).json({ error: "restaurantId, customerPhone and imageUrl are required" });
    return;
  }

  logger.info(
    { restaurantId, customerPhone, imageUrl, timestamp, senderJid },
    "[whatsapp:payment-screenshot] screenshot received"
  );

  // ── Normalize phone ────────────────────────────────────────────────────────
  const digits = customerPhone.replace(/\D/g, "").replace(/^0+/, "");
  let normalizedPhone: string | null = null;
  if (digits.length === 10) normalizedPhone = `91${digits}`;
  else if (digits.length === 12 && digits.startsWith("91")) normalizedPhone = digits;
  else if (digits.length === 11 && digits.startsWith("0")) normalizedPhone = `91${digits.slice(1)}`;

  // ── Download image from bridge URL → base64 data URL ──────────────────────
  // Download happens before the fallback checks so we only need one download
  // path regardless of which matching strategy succeeds.
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

  // ── Screenshot Inbox: persist BEFORE matching ─────────────────────────────
  //
  // Every incoming screenshot is written to the inbox first, regardless of
  // whether matching succeeds. This ensures no screenshot is ever silently
  // discarded (wrong phone, @lid sender, ambiguous candidates, future algo
  // changes). If this insert fails we still proceed so no screenshot is lost.
  //
  // Duplicate detection: same restaurant + same image hash + within 5 minutes.
  // This prevents duplicate inbox rows when the customer re-sends the same image.
  const imageHash = createHash("sha256").update(screenshotDataUrl).digest("hex");

  let inboxId: number | null = null;
  try {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const [existingDup] = await db
      .select({ id: paymentScreenshotInbox.id })
      .from(paymentScreenshotInbox)
      .where(
        and(
          eq(paymentScreenshotInbox.restaurantId, restaurantId),
          eq(paymentScreenshotInbox.imageHash, imageHash),
          gte(paymentScreenshotInbox.receivedAt, fiveMinutesAgo),
        ),
      )
      .limit(1);

    if (existingDup) {
      logger.info(
        { restaurantId, senderJid, imageHash, duplicateOfId: existingDup.id },
        "[screenshot-inbox] Duplicate screenshot detected within 5 min — skipping",
      );
      res.json({ ok: true, matched: "none", matchStrategy: "duplicate", duplicateOfId: existingDup.id });
      return;
    }

    const [inserted] = await db
      .insert(paymentScreenshotInbox)
      .values({
        restaurantId,
        receivedAt:     now,
        senderJid:      senderJid ?? null,
        senderPhone:    normalizedPhone,
        screenshotData: screenshotDataUrl,
        source:         "whatsapp",
        matchStatus:    "unmatched",
        imageHash,
        isDuplicate:    false,
      })
      .returning({ id: paymentScreenshotInbox.id });
    inboxId = inserted?.id ?? null;
    logger.debug({ inboxId, restaurantId }, "[screenshot-inbox] Inbox entry created");
  } catch (inboxErr) {
    logger.error(
      { error: (inboxErr as Error).message },
      "[screenshot-inbox] Failed to insert inbox entry — continuing with matching",
    );
  }

  // ── Match and attach (atomic: DB transaction + row-level locking) ──────────
  //
  // All SELECT + UPDATE operations run inside a single PostgreSQL transaction
  // with SELECT … FOR UPDATE SKIP LOCKED, guaranteeing:
  //
  //   • Two simultaneous screenshots for the SAME bill: the second request sees
  //     0 rows (the first transaction holds the lock) and returns "no_match"
  //     immediately — no double-attach, no blocking.
  //
  //   • Two simultaneous screenshots for DIFFERENT bills: they lock different
  //     rows and proceed concurrently without interfering.
  //
  //   • Retry webhook: after the first delivery commits, the bill's status is
  //     'awaiting_verification', so the retry query (status='sent') returns 0
  //     rows — idempotent by construction.
  //
  // Side effects (SSE, auto-reply) are intentionally performed AFTER this call
  // so they only fire once the DB is in a consistent committed state.
  //
  // Matching priority (full algorithm in screenshotMatcher.ts):
  //   P0  conversation_mapping  chatJid exact match            deterministic
  //   P1  phone_match           normalised phone, 1 result     deterministic
  //   P1  ambiguous             normalised phone, 2+ results   → discard
  //   P1.5 phone_mismatch       phone 0 matches, senderJid     heuristic
  //                             absent, 1 recent pending       (backward compat)
  //   P2  lid_single_pending    phone absent, senderJid        heuristic
  //                             absent, 1 recent pending       (backward compat)
  //   —   discard               everything else
  const outcome = await matchAndAttachScreenshot({
    restaurantId,
    senderJid,
    normalizedPhone,
    screenshotDataUrl,
    now,
  });

  if (!outcome.ok) {
    // ── Unmatched: log and return (no screenshot attached) ────────────────────
    logger.warn(
      {
        event: "screenshot_unmatched",
        matchStrategy: "no_match",
        restaurantId,
        senderPhone: normalizedPhone,
        senderJid,
        reason: outcome.reason,
        details: outcome.details,
        candidates: outcome.candidates,
      },
      "[whatsapp:payment-screenshot] screenshot not attached — no matching 'sent' session bill found"
    );

    // Update inbox entry + emit SSE so dashboard can alert the owner
    if (inboxId !== null) {
      const matchStatus =
        outcome.reason === "ambiguous_phone_multiple_bills" ? "ambiguous" : "unmatched";
      db.update(paymentScreenshotInbox)
        .set({ matchStatus, updatedAt: now })
        .where(eq(paymentScreenshotInbox.id, inboxId))
        .execute()
        .catch((err: unknown) => {
          logger.warn(
            { inboxId, error: (err as Error).message },
            "[screenshot-inbox] Failed to update inbox status to unmatched",
          );
        });
      emitScreenshotInboxEvent(restaurantId, {
        inboxId,
        matchStatus,
        receivedAt: now.toISOString(),
      });
    }

    res.json({ ok: true, matched: "none", matchStrategy: "no_match", reason: outcome.reason });
    return;
  }

  // ── Side effects after successful commit ──────────────────────────────────
  // These run OUTSIDE the transaction: the DB is already consistent and these
  // are best-effort / fire-and-forget operations.

  emitSessionScreenshotEvent(restaurantId, {
    sessionId: outcome.sessionId,
    billId: outcome.sessionBillId,
    tableNumber: outcome.tableNumber,
    billNumber: outcome.billNumber,
    total: outcome.total,
    customerPhone: outcome.effectivePhone ?? "",
  });

  // Update inbox entry to matched (fire-and-forget — screenshot is already on the bill)
  if (inboxId !== null) {
    db.update(paymentScreenshotInbox)
      .set({
        matchStatus:      "matched",
        matchedSessionId: outcome.sessionId,
        matchedBillId:    outcome.sessionBillId,
        matchingStrategy: outcome.strategy,
        updatedAt:        now,
      })
      .where(eq(paymentScreenshotInbox.id, inboxId))
      .execute()
      .catch((err: unknown) => {
        logger.warn(
          { inboxId, error: (err as Error).message },
          "[screenshot-inbox] Failed to update inbox status to matched",
        );
      });
  }

  if (outcome.needsAutoReply) {
    // P1.5 phone_mismatch: notify the sender that their phone doesn't match.
    const replyMessage =
      "The phone number used to send this payment proof does not match the phone number used to place the order.\n\nPlease resend the payment proof from the original ordering phone number.";
    fetch(`${BRIDGE_URL}/api/send-message`, {
      method: "POST",
      headers: bridgeHeaders(),
      body: JSON.stringify({ restaurantId, phone: outcome.effectivePhone, message: replyMessage }),
      signal: AbortSignal.timeout(8000),
    })
      .then(() => {
        logger.info(
          { restaurantId, senderPhone: outcome.effectivePhone },
          "[whatsapp:payment-screenshot:mismatch] auto-reply sent to sender"
        );
      })
      .catch((replyErr: unknown) => {
        logger.warn(
          { error: (replyErr as Error).message },
          "[whatsapp:payment-screenshot:mismatch] auto-reply failed — continuing"
        );
      });
  }

  const logLevel = outcome.phoneMismatch ? "warn" : "info";
  logger[logLevel](
    {
      event: outcome.phoneMismatch ? "session_screenshot_phone_mismatch" : "session_screenshot_received",
      matchStrategy: outcome.strategy,
      sessionBillId: outcome.sessionBillId,
      sessionId: outcome.sessionId,
      restaurantId,
      senderJid,
      customerPhone: outcome.effectivePhone,
      phoneMismatch: outcome.phoneMismatch,
    },
    `[whatsapp:payment-screenshot] screenshot attached — matchStrategy: ${outcome.strategy}`
  );

  res.json(outcome.matchedResponse);
}) as RequestHandler);

export default router;
