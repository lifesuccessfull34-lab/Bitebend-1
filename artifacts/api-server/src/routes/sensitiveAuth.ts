import { Router } from "express";
import bcrypt from "bcrypt";
import { db } from "@workspace/db";
import { adminSensitiveAuth } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { createRateLimiter } from "../lib/rateLimiter";
import type { RequestHandler } from "express";

const router = Router();

const UNLOCK_DURATION_MS = 5 * 60 * 1_000;
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

const verifyLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1_000,
  label: "admin:sensitive-auth:verify",
});
const setupLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1_000,
  label: "admin:sensitive-auth:setup",
});
const changeLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1_000,
  label: "admin:sensitive-auth:change",
});

// GET /api/admin/sensitive-auth/status
// Returns whether a password is configured and whether the session is currently unlocked.
const getStatus: RequestHandler = async (req, res) => {
  const userId = req.user!.id;

  const [record] = await db
    .select({ id: adminSensitiveAuth.id, updatedAt: adminSensitiveAuth.updatedAt })
    .from(adminSensitiveAuth)
    .where(eq(adminSensitiveAuth.userId, userId))
    .limit(1);

  const expiresAt = req.session.sensitiveActionExpiresAt ?? null;
  const unlocked = expiresAt !== null && Date.now() < expiresAt;

  if (expiresAt && !unlocked) {
    delete req.session.sensitiveActionExpiresAt;
  }

  res.json({
    configured: !!record,
    unlocked,
    expiresAt: unlocked ? expiresAt : null,
    lastChangedAt: record?.updatedAt ?? null,
  });
};

// POST /api/admin/sensitive-auth/setup
// First-time Sensitive Action Password creation.
// Returns 409 if already configured — use change endpoint instead.
const setup: RequestHandler = async (req, res) => {
  const userId = req.user!.id;
  const { password } = req.body as { password?: string };

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  const [existing] = await db
    .select({ id: adminSensitiveAuth.id })
    .from(adminSensitiveAuth)
    .where(eq(adminSensitiveAuth.userId, userId))
    .limit(1);

  if (existing) {
    res.status(409).json({
      error: "Sensitive action password already configured. Use the change endpoint.",
      code: "ALREADY_CONFIGURED",
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.insert(adminSensitiveAuth).values({ userId, passwordHash });

  const expiresAt = Date.now() + UNLOCK_DURATION_MS;
  req.session.sensitiveActionExpiresAt = expiresAt;

  req.log.info({ event: "sensitive_auth_setup", portal: "admin", userId, ip: req.ip });

  res.json({ ok: true, expiresAt });
};

// POST /api/admin/sensitive-auth/verify
// Verify the Sensitive Action Password. On success, unlocks the session for 5 minutes.
const verify: RequestHandler = async (req, res) => {
  const userId = req.user!.id;
  const { password } = req.body as { password?: string };

  if (!password) {
    res.status(400).json({ error: "Password is required" });
    return;
  }

  const [record] = await db
    .select()
    .from(adminSensitiveAuth)
    .where(eq(adminSensitiveAuth.userId, userId))
    .limit(1);

  if (!record) {
    req.log.warn({
      event: "sensitive_auth_verify_failed",
      portal: "admin",
      userId,
      ip: req.ip,
      reason: "not_configured",
    });
    res.status(404).json({ error: "Sensitive action password not configured", code: "NOT_CONFIGURED" });
    return;
  }

  const match = await bcrypt.compare(password, record.passwordHash);
  if (!match) {
    req.log.warn({
      event: "sensitive_auth_verify_failed",
      portal: "admin",
      userId,
      ip: req.ip,
      reason: "wrong_password",
    });
    res.status(401).json({ error: "Incorrect password", code: "WRONG_PASSWORD" });
    return;
  }

  const expiresAt = Date.now() + UNLOCK_DURATION_MS;
  req.session.sensitiveActionExpiresAt = expiresAt;

  req.log.info({ event: "sensitive_auth_verified", portal: "admin", userId, ip: req.ip });

  res.json({ ok: true, expiresAt });
};

// PUT /api/admin/sensitive-auth/change
// Change the Sensitive Action Password. Requires the current password.
const change: RequestHandler = async (req, res) => {
  const userId = req.user!.id;
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  const [record] = await db
    .select()
    .from(adminSensitiveAuth)
    .where(eq(adminSensitiveAuth.userId, userId))
    .limit(1);

  if (!record) {
    res.status(404).json({ error: "Sensitive action password not configured", code: "NOT_CONFIGURED" });
    return;
  }

  const match = await bcrypt.compare(currentPassword, record.passwordHash);
  if (!match) {
    req.log.warn({
      event: "sensitive_auth_verify_failed",
      portal: "admin",
      userId,
      ip: req.ip,
      reason: "wrong_password",
    });
    res.status(401).json({ error: "Incorrect current password", code: "WRONG_PASSWORD" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db
    .update(adminSensitiveAuth)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(adminSensitiveAuth.userId, userId));

  delete req.session.sensitiveActionExpiresAt;

  req.log.info({ event: "sensitive_auth_changed", portal: "admin", userId, ip: req.ip });

  res.json({ ok: true });
};

// POST /api/admin/sensitive-auth/lock
// Manually revoke the current session's sensitive action unlock.
const lock: RequestHandler = (req, res) => {
  const userId = req.user!.id;
  delete req.session.sensitiveActionExpiresAt;
  req.log.info({ event: "sensitive_auth_locked", portal: "admin", userId, ip: req.ip });
  res.json({ ok: true });
};

router.get("/admin/sensitive-auth/status", requireAdmin, getStatus);
router.post("/admin/sensitive-auth/setup", requireAdmin, setupLimiter, setup);
router.post("/admin/sensitive-auth/verify", requireAdmin, verifyLimiter, verify);
router.put("/admin/sensitive-auth/change", requireAdmin, changeLimiter, change);
router.post("/admin/sensitive-auth/lock", requireAdmin, lock);

export default router;
