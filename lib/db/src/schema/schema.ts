import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: integer("price").notNull().default(0),
  customerLimit: integer("customer_limit").notNull().default(0),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  validityType: text("validity_type", { enum: ["days", "months"] }).notNull().default("days"),
  validityValue: integer("validity_value").notNull().default(30),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["super_admin", "owner"] })
    .notNull()
    .default("owner"),
  restaurantId: integer("restaurant_id"),
  tempPassword: text("temp_password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  cuisineType: text("cuisine_type").notNull(),
  logoUrl: text("logo_url"),
  address: text("address"),
  city: text("city").notNull(),
  state: text("state"),
  district: text("district"),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  ownerId: integer("owner_id"),
  isActive: boolean("is_active").notNull().default(true),
  upiId: text("upi_id"),
  upiName: text("upi_name"),
  personalUpiEnabled: boolean("personal_upi_enabled").notNull().default(false),
  upiVerified: boolean("upi_verified").notNull().default(false),
  verifiedAt: timestamp("verified_at"),
  qrImageData: text("qr_image_data"),
  qrDecodedPayload: text("qr_decoded_payload"),
  qrMerchantName: text("qr_merchant_name"),
  qrExtractedUpiId: text("qr_extracted_upi_id"),
  paymentQrEnabled: boolean("payment_qr_enabled").notNull().default(false),
  whatsappNumber: text("whatsapp_number"),
  taxPercent: integer("tax_percent").notNull().default(5),
  seatingLabel: text("seating_label"),
  razorpayKeyId: text("razorpay_key_id"),
  razorpayKeySecret: text("razorpay_key_secret"),
  razorpayWebhookSecret: text("razorpay_webhook_secret"),
  approvalStatus: text("approval_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("approved"),
  approvalNote: text("approval_note"),
  subscriptionPlan: text("subscription_plan", { enum: ["free", "basic", "premium"] }).notNull().default("free"),
  subscriptionFee: integer("subscription_fee").notNull().default(0),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  planId: integer("plan_id").references(() => subscriptionPlans.id),
  customersUsed: integer("customers_used").notNull().default(0),
  customerLimit: integer("customer_limit").notNull().default(0),
  subscriptionStatus: text("subscription_status", { enum: ["active", "exhausted", "suspended", "expired"] }).notNull().default("active"),
  subscriptionStartedAt: timestamp("subscription_started_at"),
  termsAccepted: boolean("terms_accepted").notNull().default(false),
  privacyAccepted: boolean("privacy_accepted").notNull().default(false),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscriptionTransactions = pgTable("subscription_transactions", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => subscriptionPlans.id),
  amount: integer("amount").notNull(),
  paymentMethod: text("payment_method").notNull().default("razorpay"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  status: text("status", { enum: ["pending", "paid", "failed"] }).notNull().default("pending"),
  customersAdded: integer("customers_added").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type", { enum: ["info", "warning", "success", "error"] }).notNull().default("info"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const menuCategories = pgTable("menu_categories", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => menuCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  imageUrl: text("image_url"),
  isAvailable: boolean("is_available").notNull().default(true),
  isVeg: boolean("is_veg").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
});

export const restaurantTables = pgTable("restaurant_tables", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  tableNumber: text("table_number").notNull(),
  area: text("area"),
  qrCodeUrl: text("qr_code_url"),
  isOccupied: boolean("is_occupied").notNull().default(false),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id")
    .notNull()
    .references(() => restaurants.id),
  tableId: integer("table_id"),
  tableNumber: text("table_number"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  status: text("status", {
    enum: [
      "ordered",
      "pending_payment",
      "awaiting_confirmation",
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "completed",
      "cancelled",
      "payment_failed",
    ],
  })
    .notNull()
    .default("ordered"),
  subtotal: integer("subtotal").notNull(),
  tax: integer("tax").notNull().default(0),
  total: integer("total").notNull(),
  paymentStatus: text("payment_status", { enum: ["unpaid", "paid", "manual_review"] })
    .notNull()
    .default("unpaid"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  paymentScreenshotUrl: text("payment_screenshot_url"),
  paymentOcrData: text("payment_ocr_data"),
  paymentVerificationStatus: text("payment_verification_status"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  menuItemId: integer("menu_item_id")
    .references(() => menuItems.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  isVeg: boolean("is_veg").notNull().default(true),
  notes: text("notes"),
});

export const adminPasswordResetTokens = pgTable("admin_password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const imageBlobs = pgTable("image_blobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  data: text("data").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
