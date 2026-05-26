import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "@workspace/db";
import { users, adminPasswordResetTokens } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import type { RequestHandler } from "express";

const router = Router();

function buildResetLink(req: Parameters<RequestHandler>[0], token: string): string {
  // Priority: SITE_URL (custom domain) → request host (dev fallback).
  // In production always force https:// — req.protocol is normally already
  // "https" (trust proxy reads X-Forwarded-Proto), but we make it explicit so
  // the generated link is never accidentaly http:// even if the proxy header
  // is absent on a first request before the HTTPS redirect fires.
  const base = process.env.SITE_URL?.trim()
    ? `${process.env.SITE_URL.trim()}/portal`
    : `${process.env.NODE_ENV === "production" ? "https" : req.protocol}://${req.get("host")}/portal`;
  return `${base}/admin/reset-password?token=${token}`;
}

// ── POST /api/admin/auth/forgot-password ────────────────────────────────────
// Accepts an admin email, generates a single-use 30-minute token, and either
// sends it via email (when SMTP is configured) or returns the link in the
// response (dev / no-email-configured fallback).
// Never reveals whether the email exists (always returns 200).
// Only processes super_admin accounts — never touches restaurant owner rows.
const forgotPassword: RequestHandler = async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const normalised = email.trim().toLowerCase();

  // Strict admin-only lookup — WHERE role = 'super_admin'
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, normalised), eq(users.role, "super_admin")))
    .limit(1);

  if (!user) {
    // Generic 200 — do not reveal whether this email is an admin
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
    req.log.warn(
      { adminEmail: user.email, resetLink },
      "Admin password reset — SMTP not configured, returning reset link in response",
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

// ── POST /api/admin/auth/reset-password ─────────────────────────────────────
// Validates token, hashes new password with bcrypt (exactly once),
// updates ONLY the super_admin row, and immediately invalidates the token.
// No code path here touches restaurant owner accounts.
const resetPassword: RequestHandler = async (req, res) => {
  const { token, newPassword } = req.body as {
    token?: string;
    newPassword?: string;
  };

  if (!token || !newPassword) {
    res.status(400).json({ error: "Token and new password are required" });
    return;
  }
  if (newPassword.length < 8) {
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

  req.log.info(
    { userId: user.id, adminEmail: user.email },
    "Admin password reset successful",
  );

  res.json({ ok: true });
};

router.post("/admin/auth/forgot-password", forgotPassword);
router.get("/admin/auth/validate-reset-token", validateResetToken);
router.post("/admin/auth/reset-password", resetPassword);

export default router;
