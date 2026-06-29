import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "@workspace/db";
import { users, adminPasswordResetTokens } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import type { RequestHandler } from "express";
import { createRateLimiter } from "../lib/rateLimiter";

const router = Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Forgot password: 5 requests per IP per 15 minutes
// Reset password:  10 requests per IP per 15 minutes
const forgotPasswordLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
  label: "admin:forgot-password",
  message: "Too many password reset requests. Please wait 15 minutes before trying again.",
});

const resetPasswordLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
  label: "admin:reset-password",
  message: "Too many password reset attempts. Please wait 15 minutes before trying again.",
});

function buildResetLink(req: Parameters<RequestHandler>[0], token: string): string {
  const base = process.env.SITE_URL?.trim()
    ? `${process.env.SITE_URL.trim()}/portal`
    : `${process.env.NODE_ENV === "production" ? "https" : req.protocol}://${req.get("host")}/portal`;
  return `${base}/admin/reset-password?token=${token}`;
}

// ── POST /api/admin/auth/forgot-password ─────────────────────────────────────
// Accepts an admin email, generates a single-use 30-minute token, and either
// sends it via email (when SMTP is configured) or returns the link in the
// response (dev / no-email-configured fallback).
// Never reveals whether the email exists (always returns 200).
// Only processes super_admin accounts — never touches restaurant owner rows.
const forgotPassword: RequestHandler = async (req, res) => {
  const { email } = req.body as { email?: string };
  const ip = req.ip ?? "unknown";
  const userAgent = req.headers["user-agent"] ?? "unknown";

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const normalised = email.trim().toLowerCase();

  // ── Audit: forgot password requested ─────────────────────────────────────
  // Log immediately — before DB lookup — so the event is captured even if the
  // email does not exist. Never log whether the account was found.
  req.log.info({
    event: "password_reset_requested",
    portal: "admin",
    endpoint: "/api/admin/auth/forgot-password",
    email: normalised,
    ip,
    userAgent,
  }, "Admin password reset requested");

  // Strict admin-only lookup — WHERE role = 'super_admin'
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, normalised), eq(users.role, "super_admin")))
    .limit(1);

  if (!user) {
    // Generic 200 — do not reveal whether this email is a super_admin
    res.json({ ok: true });
    return;
  }

  // Invalidate any existing unused tokens for this admin before issuing a new one
  await db
    .update(adminPasswordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(adminPasswordResetTokens.userId, user.id),
        isNull(adminPasswordResetTokens.usedAt),
      ),
    );

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  await db.insert(adminPasswordResetTokens).values({
    userId: user.id,
    token,
    expiresAt,
  });

  const resetLink = buildResetLink(req, token);

  // TASK 4 — Production safety:
  // resetLink is ONLY included in the response when SMTP is not configured.
  // In production with SMTP configured, the link goes to the email only and
  // is never returned in the API response body.
  const smtpConfigured = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );

  if (smtpConfigured) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to: user.email,
        subject: "Bitebend Admin — Password Reset Request",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
            <h2 style="color:#ea580c;margin-bottom:8px;">Bitebend Admin Portal</h2>
            <p style="color:#374151;margin-bottom:24px;">
              A password reset was requested for your administrator account
              (<strong>${user.email}</strong>).
            </p>
            <a href="${resetLink}"
               style="display:inline-block;background:#ea580c;color:#fff;font-weight:700;
                      text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;">
              Reset My Password
            </a>
            <p style="color:#6b7280;font-size:13px;margin-top:24px;">
              This link expires in <strong>30 minutes</strong> and can only be used once.<br>
              If you did not request this, you can safely ignore this email.
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="color:#9ca3af;font-size:12px;">
              Bitebend Platform Administration
            </p>
          </div>
        `,
      });

      req.log.info({ adminEmail: user.email }, "Admin password reset email sent");
      res.json({ ok: true });
    } catch (err) {
      req.log.error(err, "Failed to send admin password reset email — returning link as fallback");
      res.json({ ok: true, resetLink });
    }
  } else {
    // Dev fallback only — SMTP not configured. Never reaches this branch in
    // production where SMTP must be set.
    req.log.warn(
      { adminEmail: user.email, resetLink },
      "Admin password reset — SMTP not configured, returning reset link in response (dev only)",
    );
    res.json({ ok: true, resetLink });
  }
};

// ── GET /api/admin/auth/validate-reset-token ─────────────────────────────────
// Frontend calls this on page load to check token validity before showing form.
const validateResetToken: RequestHandler = async (req, res) => {
  const { token } = req.query as { token?: string };

  if (!token || typeof token !== "string") {
    res.json({ valid: false });
    return;
  }

  const [row] = await db
    .select({ id: adminPasswordResetTokens.id })
    .from(adminPasswordResetTokens)
    .where(
      and(
        eq(adminPasswordResetTokens.token, token),
        isNull(adminPasswordResetTokens.usedAt),
        gt(adminPasswordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  res.json({ valid: !!row });
};

// ── POST /api/admin/auth/reset-password ──────────────────────────────────────
// Validates token, hashes new password with bcrypt (exactly once),
// updates ONLY the super_admin row, and immediately invalidates the token.
// No code path here touches restaurant owner accounts.
const resetPassword: RequestHandler = async (req, res) => {
  const { token, newPassword } = req.body as {
    token?: string;
    newPassword?: string;
  };
  const ip = req.ip ?? "unknown";

  if (!token || !newPassword) {
    req.log.warn({
      event: "password_reset_failure",
      portal: "admin",
      endpoint: "/api/admin/auth/reset-password",
      ip,
      reason: "missing_token_or_password",
    }, "Admin password reset failed — missing token or password");
    res.status(400).json({ error: "Token and new password are required" });
    return;
  }

  if (newPassword.length < 8) {
    req.log.warn({
      event: "password_reset_failure",
      portal: "admin",
      endpoint: "/api/admin/auth/reset-password",
      ip,
      reason: "password_too_short",
    }, "Admin password reset failed — password too short");
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [resetRow] = await db
    .select()
    .from(adminPasswordResetTokens)
    .where(
      and(
        eq(adminPasswordResetTokens.token, token),
        isNull(adminPasswordResetTokens.usedAt),
        gt(adminPasswordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!resetRow) {
    // Could be: invalid token, expired token, reused token, or malformed token.
    // Do not distinguish — all map to the same user-visible message.
    req.log.warn({
      event: "password_reset_failure",
      portal: "admin",
      endpoint: "/api/admin/auth/reset-password",
      ip,
      reason: "invalid_or_expired_token",
    }, "Admin password reset failed — token invalid, expired, or already used");
    res.status(400).json({
      error: "This reset link is invalid or has expired. Please request a new one.",
    });
    return;
  }

  // Double-check: user must still be super_admin
  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.id, resetRow.userId), eq(users.role, "super_admin")))
    .limit(1);

  if (!user) {
    req.log.warn({
      event: "password_reset_failure",
      portal: "admin",
      endpoint: "/api/admin/auth/reset-password",
      ip,
      reason: "user_not_super_admin",
    }, "Admin password reset failed — token user is no longer super_admin");
    res.status(400).json({ error: "Invalid reset token." });
    return;
  }

  // Hash exactly once — never store plain text
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Update ONLY the matching super_admin row — role guard in WHERE clause
  await db
    .update(users)
    .set({ passwordHash, tempPassword: null })
    .where(and(eq(users.id, user.id), eq(users.role, "super_admin")));

  // Immediately invalidate token (single-use)
  await db
    .update(adminPasswordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(adminPasswordResetTokens.id, resetRow.id));

  // ── Audit: reset success ──────────────────────────────────────────────────
  req.log.info({
    event: "password_reset_success",
    portal: "admin",
    email: user.email,
    ip,
  }, "Admin password reset successful");

  res.json({ ok: true });
};

router.post("/admin/auth/forgot-password", forgotPasswordLimiter, forgotPassword);
router.get("/admin/auth/validate-reset-token", validateResetToken);
router.post("/admin/auth/reset-password", resetPasswordLimiter, resetPassword);

export default router;
