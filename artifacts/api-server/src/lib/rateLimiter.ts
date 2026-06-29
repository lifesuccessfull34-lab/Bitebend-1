import { pool } from "@workspace/db";
import type { RequestHandler } from "express";

// ── Cleanup timer ─────────────────────────────────────────────────────────────
// Runs once per process (not once per limiter instance). Removes expired windows
// every 5 minutes so the table stays small. .unref() prevents this timer from
// keeping the Node process alive if everything else has stopped.

let cleanupScheduled = false;

function scheduleCleanup(): void {
  if (cleanupScheduled) return;
  cleanupScheduled = true;

  setInterval(async () => {
    try {
      await pool.query("DELETE FROM rate_limit_windows WHERE expires_at < NOW()");
    } catch {
      // Non-fatal — expired rows are filtered at query time anyway via the
      // fixed-window key scheme. The cleanup is a size optimisation, not a
      // correctness requirement.
    }
  }, 5 * 60 * 1000).unref();
}

/**
 * createRateLimiter — PostgreSQL-backed per-IP fixed-window rate limiter.
 *
 * Uses a single atomic  INSERT … ON CONFLICT DO UPDATE … RETURNING count
 * statement so there is no read-modify-write race condition. The table
 * (rate_limit_windows, migration 0023) is shared across all API server
 * instances and survives process restarts.
 *
 * Window design: fixed window per {windowMs} bucket, keyed by
 *   `{label}:{ip}:{bucketStart}` where bucketStart = floor(now / windowMs) * windowMs
 *
 * Fail-open policy: if the DB query fails (e.g. connection pool exhausted
 * during an outage), the request is allowed through and the error is logged.
 * Blocking all password reset requests during a DB outage is worse than
 * briefly loosening the rate limit while the DB recovers.
 *
 * @param maxRequests   Max allowed requests per window
 * @param windowMs      Window duration in milliseconds
 * @param label         Unique prefix to isolate limiters from each other
 * @param message       Human-readable 429 message body
 */
export function createRateLimiter(opts: {
  maxRequests: number;
  windowMs: number;
  label: string;
  message?: string;
}): RequestHandler {
  const {
    maxRequests,
    windowMs,
    label,
    message = "Too many requests. Please try again later.",
  } = opts;

  scheduleCleanup();

  return async (req, res, next) => {
    const ip = req.ip ?? "unknown";

    // Compute the start of the current fixed window so the key is stable for
    // the entire window duration. All requests within the same window period
    // share the same DB row and race safely to increment it.
    const bucketStart = Math.floor(Date.now() / windowMs) * windowMs;
    const key = `${label}:${ip}:${bucketStart}`;
    const expiresAt = new Date(bucketStart + windowMs);

    try {
      // Single atomic operation:
      //   • If the row does not exist → INSERT with count = 1
      //   • If the row exists         → UPDATE count = count + 1
      // RETURNING count gives us the current value without a second round-trip.
      const result = await pool.query<{ count: number }>(
        `INSERT INTO rate_limit_windows (key, expires_at, count)
         VALUES ($1, $2, 1)
         ON CONFLICT (key) DO UPDATE
           SET count = rate_limit_windows.count + 1
         RETURNING count`,
        [key, expiresAt],
      );

      const count = result.rows[0]?.count ?? 1;

      if (count > maxRequests) {
        const retryAfter = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
        res.set("Retry-After", String(retryAfter));
        res.status(429).json({ error: message });
        return;
      }

      next();
    } catch (err) {
      // Fail open — log and continue rather than blocking legitimate requests
      // during a transient DB error. The audit logging and handler logic still
      // run normally; only the rate counter is lost for this request.
      console.error("[rate-limiter] DB query failed — failing open:", (err as Error).message);
      next();
    }
  };
}
