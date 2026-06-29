import type { RequestHandler } from "express";
import { db } from "@workspace/db";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";

// requireSensitiveAuth — must follow requireAdmin in the middleware chain.
// Checks that the current session has an unexpired sensitive-action unlock.
// Returns 403 with a machine-readable `code` so the frontend can distinguish
// "needs password" (SENSITIVE_AUTH_REQUIRED) from "unlock expired" (SENSITIVE_AUTH_EXPIRED).
export const requireSensitiveAuth: RequestHandler = (req, res, next) => {
  const expiresAt = req.session.sensitiveActionExpiresAt;
  if (!expiresAt) {
    res.status(403).json({
      error: "Sensitive action authentication required",
      code: "SENSITIVE_AUTH_REQUIRED",
    });
    return;
  }
  if (Date.now() >= expiresAt) {
    delete req.session.sensitiveActionExpiresAt;
    res.status(403).json({
      error: "Sensitive action authentication expired",
      code: "SENSITIVE_AUTH_EXPIRED",
    });
    return;
  }
  next();
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.user = user;
  next();
};

export const requireOwner: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "owner") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  req.user = user;
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  req.user = user;
  next();
};
