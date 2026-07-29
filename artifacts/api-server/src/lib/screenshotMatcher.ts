/**
 * screenshotMatcher.ts
 *
 * DB-backed screenshot-to-bill matcher.
 *
 * Wraps all SELECT + UPDATE queries in a single PostgreSQL transaction with
 * row-level locking (SELECT … FOR UPDATE SKIP LOCKED) so that:
 *
 *   • Two simultaneous screenshots for the same bill cannot both attach:
 *     the first transaction locks the row; the second sees 0 rows (SKIP LOCKED)
 *     and returns "no_match" — idempotent by construction.
 *
 *   • Two simultaneous screenshots for DIFFERENT bills proceed independently:
 *     they lock different rows and neither blocks the other.
 *
 *   • After the first transaction commits (status → awaiting_verification),
 *     the row no longer satisfies status='sent', so any retry also finds 0
 *     rows and returns "no_match" without a second update.
 *
 * The matching decision itself lives in screenshotMatchDecider.ts (pure,
 * no DB imports) so it can be unit-tested without any mocking infrastructure.
 */

import { db, sessionBills, tableSessions } from "@workspace/db";
import { eq, and, or, desc, gte } from "drizzle-orm";
import { logger } from "./logger";
import {
  decideMatch,
  type SessionBillRow,
  type MatchStrategy,
  type UnmatchedReason,
} from "./screenshotMatchDecider";

// ── Public result types ────────────────────────────────────────────────────────

export interface MatchSuccess {
  ok: true;
  strategy: MatchStrategy;
  sessionBillId: number;
  sessionId: number;
  tableNumber: string;
  billNumber: string;
  total: number;
  phoneMismatch: boolean;
  effectivePhone: string | null;
  needsAutoReply: boolean;
  /** Ready-to-send JSON body for the HTTP response */
  matchedResponse: {
    matched: "session_bill" | "session_bill_mismatch";
    matchStrategy: MatchStrategy;
    sessionBillId: number;
  };
}

export interface MatchFailure {
  ok: false;
  reason: UnmatchedReason;
  details: string;
  candidates: number;
}

export type MatchOutcome = MatchSuccess | MatchFailure;

// ── Main entry point ───────────────────────────────────────────────────────────

/**
 * Atomically match an incoming WhatsApp payment screenshot to one session bill
 * and attach it.
 *
 * All DB reads and writes are wrapped in a single transaction with
 * SELECT … FOR UPDATE SKIP LOCKED, ensuring concurrent deliveries of the same
 * (or different) screenshots cannot cause duplicate or incorrect attachments.
 *
 * Side effects (SSE emit, auto-reply) are intentionally left to the caller:
 * they should only fire after this function resolves (i.e. after the
 * transaction has committed and the DB is in a consistent state).
 */
export async function matchAndAttachScreenshot(params: {
  restaurantId: number;
  senderJid: string | undefined;
  normalizedPhone: string | null;
  screenshotDataUrl: string;
  now: Date;
}): Promise<MatchOutcome> {
  const { restaurantId, senderJid, normalizedPhone, screenshotDataUrl, now } = params;

  // 10-digit sibling of a 12-digit Indian number ("917086670033" → "7086670033").
  // Needed for legacy bills where customerPhone was stored without the country code.
  const phone10 =
    normalizedPhone?.length === 12 && normalizedPhone.startsWith("91")
      ? normalizedPhone.slice(2)
      : null;

  return db.transaction(async (tx) => {
    // ── P0: chatJid query ──────────────────────────────────────────────────────
    // FOR UPDATE SKIP LOCKED: concurrent request for the same bill sees 0 rows
    // immediately rather than blocking, ensuring two concurrent deliveries of
    // the same webhook cannot both attach to the same bill.
    const chatJidCandidates: SessionBillRow[] = [];
    if (senderJid) {
      const rows = await tx
        .select()
        .from(sessionBills)
        .where(
          and(
            eq(sessionBills.restaurantId, restaurantId),
            eq(sessionBills.chatJid, senderJid),
            eq(sessionBills.status, "sent"),
          ),
        )
        .orderBy(desc(sessionBills.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      chatJidCandidates.push(...rows);
    }

    // ── P1: phone query ────────────────────────────────────────────────────────
    // LIMIT 2: fetch at most 2 rows so decideMatch can detect ambiguity.
    // Skipped when P0 already found a match.
    const phoneCandidates: SessionBillRow[] = [];
    if (chatJidCandidates.length === 0 && normalizedPhone !== null) {
      const rows = await tx
        .select()
        .from(sessionBills)
        .where(
          and(
            eq(sessionBills.restaurantId, restaurantId),
            or(
              eq(sessionBills.customerPhone, normalizedPhone),
              ...(phone10 ? [eq(sessionBills.customerPhone, phone10)] : []),
            ),
            eq(sessionBills.status, "sent"),
          ),
        )
        .orderBy(desc(sessionBills.createdAt))
        .limit(2)
        .for("update", { skipLocked: true });
      phoneCandidates.push(...rows);
    }

    // ── Heuristic: recent pending bills (P1.5 / LID fallback) ─────────────────
    // Only queried when:
    //   (a) senderJid was absent (old bridge — heuristic not bypassed), AND
    //   (b) all deterministic queries returned 0 results.
    // For efficiency we skip this query entirely when senderJid is present,
    // ensuring the heuristic is never invoked when chatJid matching was available.
    const recentPendingBills: SessionBillRow[] = [];
    if (
      chatJidCandidates.length === 0 &&
      phoneCandidates.length === 0 &&
      senderJid === undefined
    ) {
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      const rows = await tx
        .select()
        .from(sessionBills)
        .where(
          and(
            eq(sessionBills.restaurantId, restaurantId),
            eq(sessionBills.status, "sent"),
            gte(sessionBills.sentAt, thirtyMinutesAgo),
          ),
        )
        .orderBy(desc(sessionBills.createdAt))
        .limit(2)
        .for("update", { skipLocked: true });
      recentPendingBills.push(...rows);
    }

    // ── Delegate to pure decision function ────────────────────────────────────
    const decision = decideMatch({
      senderJid,
      normalizedPhone,
      chatJidCandidates,
      phoneCandidates,
      recentPendingBills,
    });

    if (decision.action === "discard") {
      return {
        ok: false,
        reason: decision.reason,
        details: decision.details,
        candidates: decision.candidates,
      } satisfies MatchFailure;
    }

    // ── Attach screenshot (within the same transaction) ───────────────────────
    const { bill, strategy, phoneMismatch, effectivePhone } = decision;

    await tx
      .update(sessionBills)
      .set({
        screenshotUrl: screenshotDataUrl,
        screenshotReceivedAt: now,
        senderPhone: effectivePhone,
        phoneMismatch,
        status: "awaiting_verification",
        updatedAt: now,
      })
      .where(eq(sessionBills.id, bill.id));

    await tx
      .update(tableSessions)
      .set({ status: "awaiting_verification", updatedAt: now })
      .where(eq(tableSessions.id, bill.sessionId));

    // Fetch tableNumber for SSE emission (read within same transaction for
    // consistency; does not need FOR UPDATE — we already hold the bill lock).
    const [session] = await tx
      .select({ tableNumber: tableSessions.tableNumber })
      .from(tableSessions)
      .where(eq(tableSessions.id, bill.sessionId))
      .limit(1);

    // ── JID audit log ──────────────────────────────────────────────────────────
    // Keeps the same structured fields as the previous per-strategy audit blocks
    // so existing log queries / dashboards continue to work.
    logger.info(
      {
        event: "jid_audit",
        matchStrategy: strategy,
        senderJid,
        storedChatJid: bill.chatJid,
        jidMatch:
          senderJid != null && bill.chatJid != null
            ? senderJid === bill.chatJid
            : null,
        senderJidSuffix: senderJid?.includes("@lid")
          ? "@lid"
          : senderJid?.includes("@c.us")
          ? "@c.us"
          : senderJid
          ? "other"
          : null,
        storedChatJidSuffix: bill.chatJid?.includes("@lid")
          ? "@lid"
          : bill.chatJid?.includes("@c.us")
          ? "@c.us"
          : bill.chatJid
          ? "other"
          : null,
        sessionBillId: bill.id,
        billAgeMs: bill.sentAt ? now.getTime() - bill.sentAt.getTime() : null,
        phoneMismatch,
      },
      `[jid-audit] JID round-trip check — strategy: ${strategy}`,
    );

    return {
      ok: true,
      strategy,
      sessionBillId: bill.id,
      sessionId: bill.sessionId,
      tableNumber: session?.tableNumber ?? "?",
      billNumber: bill.billNumber,
      total: bill.total,
      phoneMismatch,
      effectivePhone,
      needsAutoReply: decision.needsAutoReply,
      matchedResponse: {
        matched: phoneMismatch ? "session_bill_mismatch" : "session_bill",
        matchStrategy: strategy,
        sessionBillId: bill.id,
      },
    } satisfies MatchSuccess;
  });
}
