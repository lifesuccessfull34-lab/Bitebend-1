import { db, orders, paymentScreenshotInbox } from "@workspace/db";
import { and, isNotNull, lt, or, eq, isNull } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Screenshot retention policy — PAYMENT_SCREENSHOT_RETENTION_DAYS (default: 30).
 *
 * After an order reaches a terminal payment state (paid or rejected) AND the
 * retention window has elapsed, the raw screenshot blob is deleted.
 *
 * Audit metadata (paymentVerificationStatus, verificationMethod, verifiedBy,
 * verifiedAt) is intentionally preserved.
 *
 * Run once on startup, then every 24 h via setInterval in index.ts.
 */

function getRetentionMs(): number {
  const days = parseInt(process.env["PAYMENT_SCREENSHOT_RETENTION_DAYS"] ?? "30");
  const resolved = Number.isNaN(days) || days <= 0 ? 30 : days;
  return resolved * 24 * 60 * 60 * 1000;
}

export async function purgeExpiredScreenshots(): Promise<void> {
  const cutoff = new Date(Date.now() - getRetentionMs());

  try {
    const purged = await db
      .update(orders)
      .set({ paymentScreenshotUrl: null })
      .where(
        and(
          isNotNull(orders.paymentScreenshotUrl),
          or(
            eq(orders.paymentStatus, "paid"),
            eq(orders.paymentVerificationStatus, "rejected"),
          ),
          lt(orders.updatedAt, cutoff),
        ),
      )
      .returning({ id: orders.id });

    if (purged.length > 0) {
      logger.info(
        { purged: purged.length, cutoff },
        "screenshot_cleanup: purged expired payment screenshots",
      );
    }
  } catch (err) {
    logger.error({ err }, "screenshot_cleanup: failed to purge payment screenshots");
  }

  // ── Screenshot Inbox: null out screenshot_data after retention window ────────
  // Keeps audit metadata (match_status, matched IDs, sender info) forever but
  // removes the binary blob on the same 30-day schedule as orders.
  try {
    const inboxPurged = await db
      .update(paymentScreenshotInbox)
      .set({ screenshotData: null, updatedAt: new Date() })
      .where(
        and(
          isNotNull(paymentScreenshotInbox.screenshotData),
          lt(paymentScreenshotInbox.receivedAt, cutoff),
        ),
      )
      .returning({ id: paymentScreenshotInbox.id });

    if (inboxPurged.length > 0) {
      logger.info(
        { purged: inboxPurged.length, cutoff },
        "screenshot_cleanup: purged inbox screenshot blobs",
      );
    }
  } catch (err) {
    logger.error({ err }, "screenshot_cleanup: failed to purge inbox screenshot blobs");
  }
}
