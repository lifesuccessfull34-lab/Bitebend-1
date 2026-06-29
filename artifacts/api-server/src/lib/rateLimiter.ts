import type { RequestHandler } from "express";

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

// Clean up expired windows every 15 minutes to avoid unbounded memory growth.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, w] of store) {
      if (now > w.resetAt) store.delete(key);
    }
  },
  15 * 60 * 1000,
).unref();

/**
 * createRateLimiter — lightweight per-IP sliding-window rate limiter.
 *
 * Uses express's req.ip (which already honours the `trust proxy` setting
 * set in app.ts), so the real client IP is used rather than the proxy IP.
 *
 * @param maxRequests   Max allowed requests per window
 * @param windowMs      Window duration in milliseconds
 * @param label         Unique key prefix to isolate limiters from each other
 * @param message       Human-readable 429 message (must not reveal account existence)
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

  return (req, res, next) => {
    const ip = req.ip ?? "unknown";
    const key = `${label}:${ip}`;
    const now = Date.now();

    let w = store.get(key);

    if (!w || now > w.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    w.count += 1;

    if (w.count > maxRequests) {
      const retryAfter = Math.ceil((w.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
