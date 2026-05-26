import { Router } from "express";
import bcrypt from "bcrypt";
import { db } from "@workspace/db";
import { users, restaurants, subscriptionPlans, subscriptionTransactions, notifications } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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

// ── Forgot password (self-service via email + phone verification) ─────────────

const forgotPassword: RequestHandler = async (req, res) => {
  const { email, phone } = req.body as { email?: string; phone?: string };

  if (!email || !phone) {
    res.status(400).json({ error: "Email and phone number are required." });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  if (!user || user.role === "super_admin" || !user.restaurantId) {
    // Return generic error to avoid leaking account existence
    res.status(404).json({ error: "No account found matching these details. Please check your email and phone number." });
    return;
  }

  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, user.restaurantId))
    .limit(1);

  const normalise = (s: string) => s.replace(/\D/g, "").slice(-10);
  if (!restaurant || normalise(restaurant.phone ?? "") !== normalise(phone)) {
    res.status(404).json({ error: "No account found matching these details. Please check your email and phone number." });
    return;
  }

  // Generate a readable temp password: word-word-digits
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const seg = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const newPassword = `${seg(4)}-${seg(4)}-${seg(4)}`;

  const hash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));

  res.json({ newPassword });
};

router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/logout", logout);
router.get("/auth/me", me);
router.get("/auth/platform-key", getPlatformKey);
router.post("/auth/registration-order", createRegistrationOrder);
router.post("/auth/forgot-password", forgotPassword);

export default router;
