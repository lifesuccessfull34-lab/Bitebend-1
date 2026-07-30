/**
 * screenshotInbox.ts
 *
 * Routes for the Payment Screenshot Inbox.
 *
 * GET  /owner/screenshot-inbox               — list (filtered, paginated)
 * GET  /owner/screenshot-inbox/:id/image     — fetch raw screenshot data
 * PATCH /owner/screenshot-inbox/:id/attach   — manually attach to a bill
 * POST  /owner/screenshot-inbox/:id/retry-match — re-run matching engine
 */

import { Router } from "express";
import { db, paymentScreenshotInbox, sessionBills, tableSessions } from "@workspace/db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { requireOwner } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { matchAndAttachScreenshot } from "../lib/screenshotMatcher";
import { emitSessionScreenshotEvent, emitScreenshotInboxEvent } from "../lib/orderEvents";
import type { RequestHandler } from "express";

const router = Router();

// ── List inbox ─────────────────────────────────────────────────────────────────
// Returns inbox entries without screenshot_data (blobs fetched separately).

const listInboxHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) { res.status(400).json({ error: "No restaurant" }); return; }

  const rawStatus = (req.query["status"] as string) ?? "all";
  const validStatuses = ["all", "matched", "unmatched", "ambiguous"] as const;
  const status = validStatuses.includes(rawStatus as (typeof validStatuses)[number])
    ? (rawStatus as (typeof validStatuses)[number])
    : "all";

  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  const whereClause = status === "all"
    ? eq(paymentScreenshotInbox.restaurantId, restaurantId)
    : and(
        eq(paymentScreenshotInbox.restaurantId, restaurantId),
        eq(paymentScreenshotInbox.matchStatus, status),
      );

  const [entries, [{ total }]] = await Promise.all([
    db
      .select({
        id:                paymentScreenshotInbox.id,
        restaurantId:      paymentScreenshotInbox.restaurantId,
        receivedAt:        paymentScreenshotInbox.receivedAt,
        senderJid:         paymentScreenshotInbox.senderJid,
        senderPhone:       paymentScreenshotInbox.senderPhone,
        source:            paymentScreenshotInbox.source,
        matchStatus:       paymentScreenshotInbox.matchStatus,
        matchedSessionId:  paymentScreenshotInbox.matchedSessionId,
        matchedBillId:     paymentScreenshotInbox.matchedBillId,
        matchingStrategy:  paymentScreenshotInbox.matchingStrategy,
        isDuplicate:       paymentScreenshotInbox.isDuplicate,
        hasScreenshot:     sql<boolean>`screenshot_data IS NOT NULL`,
        createdAt:         paymentScreenshotInbox.createdAt,
        updatedAt:         paymentScreenshotInbox.updatedAt,
      })
      .from(paymentScreenshotInbox)
      .where(whereClause)
      .orderBy(desc(paymentScreenshotInbox.receivedAt))
      .limit(PAGE_SIZE)
      .offset(offset),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(paymentScreenshotInbox)
      .where(whereClause),
  ]);

  res.json({
    entries,
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
  });
};

// ── Fetch screenshot image ─────────────────────────────────────────────────────
// Separated from the list so the list endpoint is fast (no base64 blobs).

const getImageHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) { res.status(400).json({ error: "No restaurant" }); return; }

  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [entry] = await db
    .select({
      screenshotData: paymentScreenshotInbox.screenshotData,
      restaurantId:   paymentScreenshotInbox.restaurantId,
    })
    .from(paymentScreenshotInbox)
    .where(
      and(
        eq(paymentScreenshotInbox.id, id),
        eq(paymentScreenshotInbox.restaurantId, restaurantId),
      ),
    )
    .limit(1);

  if (!entry) { res.status(404).json({ error: "Not found" }); return; }

  if (!entry.screenshotData) {
    res.status(410).json({ error: "Screenshot data has been removed (retention policy)" });
    return;
  }

  res.json({ screenshotData: entry.screenshotData });
};

// ── Manual attach ─────────────────────────────────────────────────────────────
// Attaches an inbox screenshot to a specific session bill.
// Allowed target bill statuses: 'sent', 'awaiting_verification' (with confirmation).
// Blocked: 'paid', 'cancelled', 'generated'.

const attachHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) { res.status(400).json({ error: "No restaurant" }); return; }

  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { sessionBillId, forceReplace } = req.body as {
    sessionBillId?: number;
    forceReplace?: boolean;
  };

  if (!sessionBillId || !Number.isInteger(sessionBillId)) {
    res.status(400).json({ error: "sessionBillId (integer) is required" });
    return;
  }

  // Load inbox entry
  const [entry] = await db
    .select()
    .from(paymentScreenshotInbox)
    .where(
      and(
        eq(paymentScreenshotInbox.id, id),
        eq(paymentScreenshotInbox.restaurantId, restaurantId),
      ),
    )
    .limit(1);

  if (!entry) { res.status(404).json({ error: "Inbox entry not found" }); return; }

  if (!entry.screenshotData) {
    res.status(410).json({ error: "Screenshot data has been removed — cannot attach" });
    return;
  }

  // Load target bill (must belong to this restaurant)
  const [bill] = await db
    .select()
    .from(sessionBills)
    .where(
      and(
        eq(sessionBills.id, sessionBillId),
        eq(sessionBills.restaurantId, restaurantId),
      ),
    )
    .limit(1);

  if (!bill) { res.status(404).json({ error: "Session bill not found" }); return; }

  // Gate: do not allow attaching to terminal statuses
  if (bill.status === "paid" || bill.status === "cancelled") {
    res.status(422).json({
      error: `Cannot attach to a bill with status '${bill.status}'`,
    });
    return;
  }

  // Gate: 'generated' = bill exists but hasn't been sent to the customer yet,
  // so no payment screenshot should be expected.
  if (bill.status === "generated") {
    res.status(422).json({
      error: "Bill has not been sent to the customer yet — cannot attach a payment screenshot",
    });
    return;
  }

  // Soft confirmation: awaiting_verification already has a screenshot
  if (bill.status === "awaiting_verification" && bill.screenshotUrl && !forceReplace) {
    res.json({
      needsConfirmation: true,
      message: "This session bill already has a payment screenshot. Replace it?",
      existingScreenshotReceivedAt: bill.screenshotReceivedAt?.toISOString() ?? null,
    });
    return;
  }

  const now = new Date();

  // Fetch session for tableNumber (for SSE payload — read before the transaction)
  const [session] = await db
    .select({ tableNumber: tableSessions.tableNumber })
    .from(tableSessions)
    .where(eq(tableSessions.id, bill.sessionId))
    .limit(1);

  // All three DB writes run inside a single transaction so that a failure in any
  // one of them rolls back the others automatically.  SSE is emitted only after
  // the transaction commits successfully.
  await db.transaction(async (tx) => {
    // 1. Attach screenshot to session bill
    await tx
      .update(sessionBills)
      .set({
        screenshotUrl:        entry.screenshotData,
        screenshotReceivedAt: now,
        senderPhone:          entry.senderPhone ?? null,
        phoneMismatch:        false,
        status:               "awaiting_verification",
        updatedAt:            now,
      })
      .where(eq(sessionBills.id, sessionBillId));

    // 2. Update table session status
    await tx
      .update(tableSessions)
      .set({ status: "awaiting_verification", updatedAt: now })
      .where(eq(tableSessions.id, bill.sessionId));

    // 3. Update inbox entry as matched
    await tx
      .update(paymentScreenshotInbox)
      .set({
        matchStatus:       "matched",
        matchedSessionId:  bill.sessionId,
        matchedBillId:     sessionBillId,
        matchingStrategy:  "manual",
        updatedAt:         now,
      })
      .where(eq(paymentScreenshotInbox.id, id));
  });

  // Emit existing SSE event only after the transaction has committed successfully
  // (same event as the auto-match path — triggers dashboard refresh)
  emitSessionScreenshotEvent(restaurantId, {
    sessionId:     bill.sessionId,
    billId:        bill.id,
    tableNumber:   session?.tableNumber ?? "?",
    billNumber:    bill.billNumber,
    total:         bill.total,
    customerPhone: entry.senderPhone ?? bill.customerPhone ?? "",
  });

  logger.info(
    {
      event:          "manual_screenshot_attach",
      inboxId:        id,
      sessionBillId,
      sessionId:      bill.sessionId,
      restaurantId,
      userId:         req.user!.id,
      forceReplace:   forceReplace ?? false,
    },
    "[screenshot-inbox] Manual attachment completed",
  );

  res.json({ ok: true });
};

// ── Retry matching ─────────────────────────────────────────────────────────────
// Re-runs the existing matching engine against a stored inbox entry.
// Only allowed for unmatched / ambiguous entries.
// Enables future background jobs to call the same function.

const retryMatchHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) { res.status(400).json({ error: "No restaurant" }); return; }

  const id = parseInt(String(req.params["id"]), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [entry] = await db
    .select()
    .from(paymentScreenshotInbox)
    .where(
      and(
        eq(paymentScreenshotInbox.id, id),
        eq(paymentScreenshotInbox.restaurantId, restaurantId),
      ),
    )
    .limit(1);

  if (!entry) { res.status(404).json({ error: "Inbox entry not found" }); return; }

  if (entry.matchStatus === "matched") {
    res.status(422).json({
      error: "This screenshot is already matched. Use Manually Attach to reassign it.",
    });
    return;
  }

  if (!entry.screenshotData) {
    res.status(410).json({ error: "Screenshot data has been removed — cannot retry" });
    return;
  }

  const now = new Date();

  // Re-derive normalizedPhone from the stored senderPhone
  const rawPhone = entry.senderPhone ?? "";
  const digits = rawPhone.replace(/\D/g, "").replace(/^0+/, "");
  let normalizedPhone: string | null = null;
  if (digits.length === 10)                                      normalizedPhone = `91${digits}`;
  else if (digits.length === 12 && digits.startsWith("91"))      normalizedPhone = digits;
  else if (digits.length === 11 && digits.startsWith("0"))       normalizedPhone = `91${digits.slice(1)}`;

  // Re-run existing matching engine unchanged
  const outcome = await matchAndAttachScreenshot({
    restaurantId,
    senderJid:         entry.senderJid ?? undefined,
    normalizedPhone,
    screenshotDataUrl: entry.screenshotData,
    now,
  });

  if (outcome.ok) {
    await db
      .update(paymentScreenshotInbox)
      .set({
        matchStatus:      "matched",
        matchedSessionId: outcome.sessionId,
        matchedBillId:    outcome.sessionBillId,
        matchingStrategy: outcome.strategy,
        updatedAt:        now,
      })
      .where(eq(paymentScreenshotInbox.id, id));

    // Emit existing SSE so the dashboard live-updates
    emitSessionScreenshotEvent(restaurantId, {
      sessionId:     outcome.sessionId,
      billId:        outcome.sessionBillId,
      tableNumber:   outcome.tableNumber,
      billNumber:    outcome.billNumber,
      total:         outcome.total,
      customerPhone: outcome.effectivePhone ?? "",
    });

    logger.info(
      {
        event:         "inbox_retry_matched",
        inboxId:       id,
        sessionBillId: outcome.sessionBillId,
        strategy:      outcome.strategy,
        restaurantId,
      },
      "[screenshot-inbox] Retry matching succeeded",
    );

    res.json({ ok: true, matchStatus: "matched", strategy: outcome.strategy, sessionBillId: outcome.sessionBillId });
    return;
  }

  // Still unmatched/ambiguous — update status
  const matchStatus = outcome.reason === "ambiguous_phone_multiple_bills" ? "ambiguous" : "unmatched";

  await db
    .update(paymentScreenshotInbox)
    .set({ matchStatus, updatedAt: now })
    .where(eq(paymentScreenshotInbox.id, id));

  logger.info(
    {
      event:       "inbox_retry_unmatched",
      inboxId:     id,
      matchStatus,
      reason:      outcome.reason,
      restaurantId,
    },
    "[screenshot-inbox] Retry matching still unmatched",
  );

  res.json({ ok: true, matchStatus, reason: outcome.reason });
};

router.get("/owner/screenshot-inbox",               requireOwner, listInboxHandler);
router.get("/owner/screenshot-inbox/:id/image",     requireOwner, getImageHandler);
router.patch("/owner/screenshot-inbox/:id/attach",  requireOwner, attachHandler);
router.post("/owner/screenshot-inbox/:id/retry-match", requireOwner, retryMatchHandler);

export default router;
