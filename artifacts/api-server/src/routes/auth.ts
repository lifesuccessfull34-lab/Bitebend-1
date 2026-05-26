import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "@workspace/db";
import { users, restaurants, subscriptionPlans, subscriptionTransactions, notifications, ownerPasswordResetTokens } from "@workspace/db";
import { eq, sql, and, gt, isNull } from "drizzle-orm";
import type { RequestHandler } from "express";

const router = Router();

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const register: RequestHandler = async (req, res) => {
  const {
    name,
    email,
    password,
    restaurantName,
    restaurantPhone,
    restaurantAddress,
    restaurantCity,
    restaurantState,
    restaurantDistrict,
    cuisineType,
    planId,
    razorpayPaymentId,
    razorpayOrderId,
    razorpaySignature,
    termsAccepted,
    privacyAccepted,
  } = req.body as {
    name: string;
    email: string;
    password: string;
    restaurantName: string;
    restaurantPhone: string;
    restaurantAddress: string;
    restaurantCity: string;
    restaurantState?: string;
    restaurantDistrict?: string;
    cuisineType: string;
    planId?: number;
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    razorpaySignature?: string;
    termsAccepted?: boolean;
    privacyAccepted?: boolean;
  };

  if (termsAccepted !== true || privacyAccepted !== true) {
    res.status(400).json({ error: "You must accept Terms & Privacy Policy to register" });
    return;
  }

  if (!name || !email || !password || !restaurantName || !restaurantPhone || !restaurantCity || !cuisineType) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  // Validate plan if provided
  let plan = null;
  if (planId) {
    const [p] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
    if (!p) {
      res.status(400).json({ error: "Invalid plan selected" });
      return;
    }
    plan = p;

    // Verify Razorpay payment signature if provided
    if (razorpayPaymentId && razorpayOrderId && razorpaySignature) {
      const crypto = await import("crypto");
      const expectedSig = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");
      if (expectedSig !== razorpaySignature) {
        res.status(400).json({ error: "Payment verification failed" });
        return;
      }
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let slug = slugify(restaurantName);
  const existing2 = await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
  if (existing2.length > 0) slug = `${slug}-${Date.now()}`;

  const [restaurant] = await db.insert(restaurants).values({
    name: restaurantName,
    slug,
    phone: restaurantPhone,
    email,
    address: restaurantAddress ?? null,
    city: restaurantCity,
    state: restaurantState ?? null,
    district: restaurantDistrict ?? null,
    cuisineType,
    isActive: true,
    taxPercent: 5,
    planId: plan?.id ?? null,
    customerLimit: plan?.customerLimit ?? 0,
    customersUsed: 0,
    subscriptionStatus: "active",
    termsAccepted: true,
    privacyAccepted: true,
    acceptedAt: new Date(),
  }).returning();

  const [user] = await db.insert(users).values({
    name,
    email,
    passwordHash,
    role: "owner",
    restaurantId: restaurant.id,
  }).returning();

  await db.update(restaurants).set({ ownerId: user.id }).where(eq(restaurants.id, restaurant.id));

  // Record subscription transaction if plan was paid
  if (plan && razorpayPaymentId) {
    const [txn] = await db.insert(subscriptionTransactions).values({
      restaurantId: restaurant.id,
      planId: plan.id,
      amount: plan.price,
      paymentMethod: "razorpay",
      razorpayOrderId: razorpayOrderId ?? null,
      razorpayPaymentId,
      status: "paid",
      customersAdded: plan.customerLimit,
    }).returning();

    await db.insert(notifications).values({
      restaurantId: restaurant.id,
      title: "Welcome to Bitebend!",
      message: `Your ${plan.name} plan is active. You can serve up to ${plan.customerLimit.toLocaleString()} customers. Start by adding your menu!`,
      type: "success",
    });
  } else if (plan) {
    // Plan selected but paid via UPI — pending
    await db.insert(subscriptionTransactions).values({
      restaurantId: restaurant.id,
      planId: plan.id,
      amount: plan.price,
      paymentMethod: "upi",
      status: "pending",
      customersAdded: plan.customerLimit,
    });
    await db.insert(notifications).values({
      restaurantId: restaurant.id,
      title: "Welcome to Bitebend!",
      message: `Your UPI payment is pending. Once confirmed by admin, your ${plan.name} plan will be fully activated.`,
      type: "info",
    });
  } else {
    await db.insert(notifications).values({
      restaurantId: restaurant.id,
      title: "Welcome to Bitebend!",
      message: "Your account is set up. Please subscribe to a plan to start accepting orders.",
      type: "info",
    });
  }

  req.session.userId = user.id;

  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      restaurantId: user.restaurantId,
    },
  });
};

const login: RequestHandler = async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Regenerate session ID to prevent session fixation attacks
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.userId = user.id;

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      restaurantId: user.restaurantId,
    },
  });
};

const logout: RequestHandler = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
};

const me: RequestHandler = async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      restaurantId: user.restaurantId,
    },
  });
};

// Public endpoint to get platform Razorpay key for subscription payments
const getPlatformKey: RequestHandler = (_req, res) => {
  res.json({ keyId: process.env.RAZORPAY_KEY_ID ?? null });
};

// Create Razorpay order for registration plan payment (before account created)
const createRegistrationOrder: RequestHandler = async (req, res) => {
  const { planId } = req.body as { planId: number };
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    res.json({ razorpayOrderId: null, keyId: null, amount: plan.price, planName: plan.name });
    return;
  }

  const Razorpay = (await import("razorpay")).default;
  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const order = await razorpay.orders.create({
    amount: plan.price,
    currency: "INR",
    receipt: `reg_plan_${planId}_${Date.now()}`,
  });

  res.json({ razorpayOrderId: order.id, keyId, amount: plan.price, planName: plan.name });
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildOwnerResetLink(req: Parameters<RequestHandler>[0], token: string): string {
  const base = process.env.SITE_URL?.trim()
    ? `${process.env.SITE_URL.trim()}/portal`
    : `${process.env.NODE_ENV === "production" ? "https" : req.protocol}://${req.get("host")}/portal`;
  return `${base}/restaurant/reset-password?token=${token}`;
}

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
// Accepts owner email, generates a single-use 30-minute token, and either
// sends it via email (when SMTP is configured) or returns the link in the
// response as a dev fallback. Always responds 200 to avoid leaking whether
// the email exists.

const forgotPassword: RequestHandler = async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const normalised = email.trim().toLowerCase();

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, normalised), eq(users.role, "owner")))
    .limit(1);

  if (!user) {
    res.json({ ok: true });
    return;
  }

  // Invalidate any existing unused tokens before issuing a new one
  await db
    .update(ownerPasswordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(ownerPasswordResetTokens.userId, user.id), isNull(ownerPasswordResetTokens.usedAt)));

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  await db.insert(ownerPasswordResetTokens).values({ userId: user.id, token, expiresAt });

  const resetLink = buildOwnerResetLink(req, token);

  const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  if (smtpConfigured) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      const [restaurant] = await db
        .select({ name: restaurants.name })
        .from(restaurants)
        .where(eq(restaurants.id, user.restaurantId!))
        .limit(1);

      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to: user.email,
        subject: "Bitebend — Password Reset Request",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
            <h2 style="color:#ea580c;margin-bottom:8px;">Bitebend Restaurant Portal</h2>
            <p style="color:#374151;margin-bottom:8px;">Hi ${user.name},</p>
            <p style="color:#374151;margin-bottom:24px;">
              A password reset was requested for your account
              ${restaurant ? `(<strong>${restaurant.name}</strong>)` : ""} at <strong>${user.email}</strong>.
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
            <p style="color:#9ca3af;font-size:12px;">Bitebend Platform</p>
          </div>
        `,
      });

      req.log.info({ email: user.email }, "Owner password reset email sent");
      res.json({ ok: true });
    } catch (err) {
      req.log.error(err, "Failed to send owner password reset email — returning link as fallback");
      res.json({ ok: true, resetLink });
    }
  } else {
    req.log.warn({ email: user.email, resetLink }, "Owner password reset — SMTP not configured, returning reset link in response");
    res.json({ ok: true, resetLink });
  }
};

// ── GET /api/auth/validate-reset-token ───────────────────────────────────────

const validateResetToken: RequestHandler = async (req, res) => {
  const { token } = req.query as { token?: string };

  if (!token || typeof token !== "string") {
    res.json({ valid: false });
    return;
  }

  const [row] = await db
    .select({ id: ownerPasswordResetTokens.id })
    .from(ownerPasswordResetTokens)
    .where(and(
      eq(ownerPasswordResetTokens.token, token),
      isNull(ownerPasswordResetTokens.usedAt),
      gt(ownerPasswordResetTokens.expiresAt, new Date()),
    ))
    .limit(1);

  res.json({ valid: !!row });
};

// ── POST /api/auth/reset-password ────────────────────────────────────────────

const resetPassword: RequestHandler = async (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || !newPassword) {
    res.status(400).json({ error: "Token and new password are required." });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  const [resetRow] = await db
    .select()
    .from(ownerPasswordResetTokens)
    .where(and(
      eq(ownerPasswordResetTokens.token, token),
      isNull(ownerPasswordResetTokens.usedAt),
      gt(ownerPasswordResetTokens.expiresAt, new Date()),
    ))
    .limit(1);

  if (!resetRow) {
    res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
    return;
  }

  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, resetRow.userId), eq(users.role, "owner")))
    .limit(1);

  if (!user) {
    res.status(400).json({ error: "Invalid reset token." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  await db
    .update(ownerPasswordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(ownerPasswordResetTokens.id, resetRow.id));

  req.log.info({ userId: user.id }, "Owner password reset successful");

  res.json({ ok: true });
};

router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/logout", logout);
router.get("/auth/me", me);
router.get("/auth/platform-key", getPlatformKey);
router.post("/auth/registration-order", createRegistrationOrder);
router.post("/auth/forgot-password", forgotPassword);
router.get("/auth/validate-reset-token", validateResetToken);
router.post("/auth/reset-password", resetPassword);

export default router;
