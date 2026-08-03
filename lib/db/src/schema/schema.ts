import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Admin Sensitive Auth (migration 0024) ─────────────────────────────────────
// Stores the Sensitive Action Password hash for each super_admin.
// Completely independent of the login password (users.password_hash).
// One row per admin; ON DELETE CASCADE cleans up when the user is deleted.
export const adminSensitiveAuth = pgTable("admin_sensitive_auth", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Rate-limit windows (migration 0023) ───────────────────────────────────────
// Backing store for the PostgreSQL-backed per-IP fixed-window rate limiter.
// See artifacts/api-server/src/lib/rateLimiter.ts for usage.
export const rateLimitWindows = pgTable("rate_limit_windows", {
  key: text("key").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(1),
}, (t) => [
  index("idx_rate_limit_windows_expires").on(t.expiresAt),
]);

export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: doublePrecision("price").notNull().default(0),
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
  /** @deprecated — Restaurant Razorpay removed. Columns retained for historical data only. Do not write new values. */
  razorpayKeyId: text("razorpay_key_id"),
  /** @deprecated — see razorpayKeyId */
  razorpayKeySecret: text("razorpay_key_secret"),
  /** @deprecated — see razorpayKeyId */
  razorpayWebhookSecret: text("razorpay_webhook_secret"),
  approvalStatus: text("approval_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("approved"),
  approvalNote: text("approval_note"),
  subscriptionPlan: text("subscription_plan", { enum: ["free", "basic", "premium"] }).notNull().default("free"),
  subscriptionFee: doublePrecision("subscription_fee").notNull().default(0),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  planId: integer("plan_id").references(() => subscriptionPlans.id),
  customersUsed: integer("customers_used").notNull().default(0),
  customerLimit: integer("customer_limit").notNull().default(0),
  subscriptionStatus: text("subscription_status", { enum: ["active", "exhausted", "suspended", "expired"] }).notNull().default("active"),
  subscriptionStartedAt: timestamp("subscription_started_at"),
  termsAccepted: boolean("terms_accepted").notNull().default(false),
  privacyAccepted: boolean("privacy_accepted").notNull().default(false),
  acceptedAt: timestamp("accepted_at"),
  whatsappStatus: text("whatsapp_status").notNull().default("disconnected"),
  whatsappPhone: text("whatsapp_phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscriptionTransactions = pgTable("subscription_transactions", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => subscriptionPlans.id),
  amount: doublePrecision("amount").notNull(),
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
  price: doublePrecision("price").notNull(),
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

export const tableSessions = pgTable(
  "table_sessions",
  {
    id: serial("id").primaryKey(),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** Null for takeaway sessions (no physical table) */
    tableNumber: text("table_number"),
    status: text("status", {
      enum: ["active", "awaiting_payment", "awaiting_verification", "paid", "closed"],
    })
      .notNull()
      .default("active"),
    /** Discriminator: 'dine_in' (default) | 'takeaway' */
    sessionType: text("session_type", { enum: ["dine_in", "takeaway"] })
      .notNull()
      .default("dine_in"),
    /**
     * Normalized phone for session ownership (e.g. "919876543210").
     * Always stored for all session types (dine_in + takeaway).
     * Used for:
     *  - Phone-first session reuse across tables (Rule 1)
     *  - Table ownership conflict detection (Rule 3)
     *  - Bill-lock guard (Rule 4)
     *  - WhatsApp screenshot matching unambiguity
     */
    customerPhone: text("customer_phone"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_table_sessions_restaurant_id").on(t.restaurantId),
    index("idx_table_sessions_status").on(t.status),
    index("idx_table_sessions_restaurant_status").on(t.restaurantId, t.status),
    // Partial index: fast dine-in session lookup by phone (Rule 1 & Rule 3)
    index("idx_table_sessions_dine_in_phone").on(t.restaurantId, t.customerPhone, t.status).where(sql`${t.sessionType} = 'dine_in'`),
    // Partial index: fast takeaway session lookup by phone
    index("idx_table_sessions_takeaway_phone").on(t.restaurantId, t.customerPhone, t.status).where(sql`${t.sessionType} = 'takeaway'`),
    check(
      "table_sessions_status_check",
      sql`${t.status} IN ('active','awaiting_payment','awaiting_verification','paid','closed')`,
    ),
    check(
      "table_sessions_session_type_check",
      sql`${t.sessionType} IN ('dine_in','takeaway')`,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id")
    .notNull()
    .references(() => restaurants.id),
  tableId: integer("table_id"),
  tableNumber: text("table_number"),
  sessionId: integer("session_id").references(() => tableSessions.id, { onDelete: "set null" }),
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
  subtotal: doublePrecision("subtotal").notNull(),
  tax: doublePrecision("tax").notNull().default(0),
  total: doublePrecision("total").notNull(),
  paymentStatus: text("payment_status", { enum: ["unpaid", "paid", "manual_review", "awaiting_verification"] })
    .notNull()
    .default("unpaid"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  paymentScreenshotUrl: text("payment_screenshot_url"),
  paymentOcrData: text("payment_ocr_data"),
  paymentVerificationStatus: text("payment_verification_status"),
  /** Audit trail: how payment was confirmed — ocr_ai | manual_staff | cash | legacy */
  verificationMethod: text("verification_method"),
  /** Audit trail: owner user ID who manually confirmed payment */
  verifiedBy: integer("verified_by"),
  /** Audit trail: timestamp of payment confirmation */
  verifiedAt: timestamp("verified_at"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_orders_session_id").on(t.sessionId),
  ],
);

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
  unitPrice: doublePrecision("unit_price").notNull(),
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

export const ownerPasswordResetTokens = pgTable("owner_password_reset_tokens", {
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

export const billLinks = pgTable("bill_links", {
  id: uuid("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  imageBlobId: uuid("image_blob_id")
    .notNull()
    .references(() => imageBlobs.id, { onDelete: "cascade" }),
  hmacSignature: text("hmac_signature").notNull(),
  shortId: text("short_id").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  openedAt: timestamp("opened_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessionBills = pgTable(
  "session_bills",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => tableSessions.id, { onDelete: "cascade" }),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    billNumber: text("bill_number").notNull().unique(),
    subtotal: doublePrecision("subtotal").notNull(),
    tax: doublePrecision("tax").notNull().default(0),
    total: doublePrecision("total").notNull(),
    status: text("status", {
      enum: ["generated", "sent", "awaiting_verification", "paid", "cancelled"],
    })
      .notNull()
      .default("generated"),
    /** Deterministic screenshot matching: phone stored at send-time */
    customerPhone: text("customer_phone"),
    /** When bill was delivered via WhatsApp */
    sentAt: timestamp("sent_at"),
    /** Payment proof screenshot (base64 data URL) — owned by session bill, not orders */
    screenshotUrl: text("screenshot_url"),
    /** When the screenshot arrived from the customer */
    screenshotReceivedAt: timestamp("screenshot_received_at"),
    /** When staff approved or rejected */
    verifiedAt: timestamp("verified_at"),
    /** User ID of staff who approved/rejected */
    verifiedBy: integer("verified_by").references(() => users.id, { onDelete: "set null" }),
    /** When the bill was last resent (null if never resent) */
    resentAt: timestamp("resent_at"),
    /** How many times the bill was resent (0 = never resent, first send is not counted) */
    resentCount: integer("resent_count").notNull().default(0),
    /** WhatsApp sender phone — stored at screenshot receipt; may differ from customer_phone */
    senderPhone: text("sender_phone"),
    /** True when the screenshot was sent from a different phone than customer_phone */
    phoneMismatch: boolean("phone_mismatch").notNull().default(false),
    /**
     * WhatsApp-server-assigned JID for this conversation, captured from
     * sentMsg.id.remote._serialized when the bill is sent.
     *
     * This is identical to msg.from on every subsequent inbound message in the
     * same conversation, regardless of whether the customer's device uses the
     * standard @c.us JID or a multi-device @lid JID.  Storing it enables
     * Priority 0 (deterministic) matching in the screenshot webhook without
     * relying on the number of concurrent pending bills.
     *
     * NULL for bills sent before migration 0027 — those fall through to the
     * existing phone-match and LID-fallback strategies unchanged.
     */
    chatJid: text("chat_jid"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_session_bills_session_id").on(t.sessionId),
    index("idx_session_bills_restaurant_id").on(t.restaurantId),
    index("idx_session_bills_chat_jid").on(t.restaurantId, t.chatJid),
    check(
      "session_bills_status_check",
      sql`${t.status} IN ('generated','sent','awaiting_verification','paid','cancelled')`,
    ),
  ],
);

// ── Payment Screenshot Inbox (migration 0028) ─────────────────────────────────
// Captures every incoming WhatsApp payment screenshot BEFORE matching runs.
// Ensures no screenshot is silently discarded when the automatic matching
// engine fails (wrong phone, @lid sender, ambiguous candidates, etc.).
// After matching, the row is updated with match_status + matched IDs.
// screenshot_data is nullable so the 30-day cleanup job can null it out
// (same policy as orders.payment_screenshot_url) while keeping audit metadata.
export const paymentScreenshotInbox = pgTable(
  "payment_screenshot_inbox",
  {
    id:               serial("id").primaryKey(),
    restaurantId:     integer("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    receivedAt:       timestamp("received_at").notNull(),
    senderJid:        text("sender_jid"),
    senderPhone:      text("sender_phone"),
    /** Base64 data URL — nullable after 30-day retention cleanup */
    screenshotData:   text("screenshot_data"),
    source:           text("source").notNull().default("whatsapp"),
    matchStatus:      text("match_status", { enum: ["matched", "unmatched", "ambiguous"] }).notNull().default("unmatched"),
    matchedSessionId: integer("matched_session_id").references(() => tableSessions.id, { onDelete: "set null" }),
    matchedBillId:    integer("matched_bill_id").references(() => sessionBills.id, { onDelete: "set null" }),
    matchingStrategy: text("matching_strategy"),
    /** SHA-256 of screenshotData for duplicate detection */
    imageHash:        text("image_hash"),
    isDuplicate:      boolean("is_duplicate").notNull().default(false),
    duplicateOfId:    integer("duplicate_of_id"),
    createdAt:        timestamp("created_at").defaultNow().notNull(),
    updatedAt:        timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_psi_restaurant_status").on(t.restaurantId, t.matchStatus),
    index("idx_psi_restaurant_received").on(t.restaurantId, t.receivedAt),
    index("idx_psi_image_hash").on(t.restaurantId, t.imageHash),
    check(
      "psi_match_status_check",
      sql`${t.matchStatus} IN ('matched','unmatched','ambiguous')`,
    ),
  ],
);

// ── Visitor Analytics (migration 0029) ────────────────────────────────────────
// Platform-level visitor tracking for Bitebend pages (initially /login).
// One row per unique visitor (visitor_id UUID from localStorage).
// No PII: IP is SHA-256 hashed, no emails/names stored.
export const visitorSessions = pgTable(
  "visitor_sessions",
  {
    id:          serial("id").primaryKey(),
    visitorId:   text("visitor_id").notNull(),   // UUID in localStorage
    sessionId:   text("session_id").notNull(),   // UUID per browser session
    firstVisit:  timestamp("first_visit").defaultNow().notNull(),
    lastVisit:   timestamp("last_visit").defaultNow().notNull(),
    visitCount:  integer("visit_count").notNull().default(1),
    isNew:       boolean("is_new").notNull().default(true),
    // migration 0030: bot filtering
    isBot:       boolean("is_bot").notNull().default(false),
    country:     text("country"),
    state:       text("state"),
    city:        text("city"),
    browser:     text("browser"),
    os:          text("os"),
    device:      text("device"),
    language:    text("language"),
    timezone:    text("timezone"),
    hashedIp:    text("hashed_ip"),
    createdAt:   timestamp("created_at").defaultNow().notNull(),
    updatedAt:   timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_vs_visitor_id").on(t.visitorId),
    index("idx_vs_last_visit").on(t.lastVisit),
    index("idx_vs_is_new").on(t.isNew),
  ],
);

// One row per page load event, linked to a visitor_sessions row.
export const pageViews = pgTable(
  "page_views",
  {
    id:               serial("id").primaryKey(),
    visitorSessionId: integer("visitor_session_id")
      .notNull()
      .references(() => visitorSessions.id, { onDelete: "cascade" }),
    page:             text("page").notNull(),
    referrer:         text("referrer"),
    utmSource:        text("utm_source"),
    utmMedium:        text("utm_medium"),
    utmCampaign:      text("utm_campaign"),
    utmContent:       text("utm_content"),
    screenWidth:      integer("screen_width"),
    screenHeight:     integer("screen_height"),
    userAgent:        text("user_agent"),
    // migration 0030: bot filtering, duration, pre-computed classification
    isBot:            boolean("is_bot").notNull().default(false),
    durationSeconds:  integer("duration_seconds"),
    referrerDomain:   text("referrer_domain"),
    trafficSource:    text("traffic_source"),
    createdAt:        timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_pv_visitor_session_id").on(t.visitorSessionId),
    index("idx_pv_created_at").on(t.createdAt),
    index("idx_pv_utm_source").on(t.utmSource),
    index("idx_pv_utm_campaign").on(t.utmCampaign),
    index("idx_pv_page").on(t.page),
  ],
);

// Generic named-event tracking for conversion funnel (migration 0030).
// Events link back to visitor_sessions when the visitor UUID is known.
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id:               serial("id").primaryKey(),
    visitorSessionId: integer("visitor_session_id")
      .references(() => visitorSessions.id, { onDelete: "set null" }),
    sessionId:        text("session_id").notNull(),
    eventName:        text("event_name").notNull(),
    page:             text("page"),
    // JSONB bag — lets callers store arbitrary structured data without schema changes
    properties:       jsonb("properties"),
    isBot:            boolean("is_bot").notNull().default(false),
    createdAt:        timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_ae_event_name").on(t.eventName),
    index("idx_ae_session_id").on(t.sessionId),
    index("idx_ae_created_at").on(t.createdAt),
    index("idx_ae_visitor_session").on(t.visitorSessionId),
  ],
);

export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type", { enum: ["video", "pdf", "link", "plan", "faq"] }).notNull(),
  category: text("category"),
  thumbnail: text("thumbnail"),
  url: text("url"),
  fileUrl: text("file_url"),
  tags: text("tags").array().notNull().default([]),
  featured: boolean("featured").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  status: text("status", { enum: ["draft", "active", "archived"] }).notNull().default("draft"),
  approvalStatus: text("approval_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  visibleTo: text("visible_to", { enum: ["public", "restaurant", "admin", "all"] }).notNull().default("all"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  publishAt: timestamp("publish_at"),
  expireAt: timestamp("expire_at"),
  duration: text("duration"),
  videoSource: text("video_source", { enum: ["youtube", "external", "self-hosted"] }),
  sizeLabel: text("size_label"),
  planName: text("plan_name"),
  planPrice: text("plan_price"),
  planPeriod: text("plan_period"),
  planFeatures: text("plan_features").array().default([]),
  planHighlight: boolean("plan_highlight").default(false),
  planBadge: text("plan_badge"),
  planCta: text("plan_cta", { enum: ["trial", "contact"] }),
  iconName: text("icon_name"),
  iconColor: text("icon_color"),
  question: text("question"),
  answer: text("answer"),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  reviewNotes: text("review_notes"),
  rejectionReason: text("rejection_reason"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
