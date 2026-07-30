export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "super_admin" | "owner";
  restaurantId: number | null;
}

export interface SubscriptionPlan {
  id: number;
  name: string;
  price: number;
  customerLimit: number;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  validityType: "days" | "months";
  validityValue: number;
}

export interface SubscriptionTransaction {
  id: number;
  restaurantId: number;
  planId: number;
  amount: number;
  paymentMethod: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  status: "pending" | "paid" | "failed";
  customersAdded: number;
  createdAt: string;
  planName?: string;
  restaurantName?: string | null;
  restaurantState?: string | null;
  restaurantDistrict?: string | null;
}

export interface Notification {
  id: number;
  restaurantId: number | null;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  isRead: boolean;
  createdAt: string;
}

export interface Restaurant {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  cuisineType: string;
  logoUrl: string | null;
  address: string;
  city: string;
  state: string | null;
  district: string | null;
  phone: string;
  email: string;
  ownerId: number | null;
  isActive: boolean;
  upiId: string | null;
  upiName: string | null;
  personalUpiEnabled: boolean;
  upiVerified: boolean;
  verifiedAt: string | null;
  qrImageData: string | null;
  qrDecodedPayload: string | null;
  qrMerchantName: string | null;
  qrExtractedUpiId: string | null;
  paymentQrEnabled: boolean;
  whatsappNumber: string | null;
  /** @deprecated — restaurant Razorpay removed. Column retained for historical data only. */
  razorpayKeyId?: string | null;
  taxPercent: number;
  seatingLabel: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  approvalNote: string | null;
  planId: number | null;
  customersUsed: number;
  customerLimit: number;
  subscriptionStatus: "active" | "exhausted" | "suspended" | "expired";
  subscriptionExpiresAt: string | null;
  subscriptionStartedAt: string | null;
  createdAt: string;
}

export interface MenuCategory {
  id: number;
  restaurantId: number;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export interface MenuItem {
  id: number;
  restaurantId: number;
  categoryId: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  isVeg: boolean;
  displayOrder: number;
}

export interface RestaurantTable {
  id: number;
  restaurantId: number;
  tableNumber: string;
  area: string | null;
  qrCodeUrl: string | null;
  isOccupied: boolean;
}

export interface OrderItem {
  id: number;
  orderId: number;
  menuItemId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  isVeg: boolean;
  notes: string | null;
}

export interface SessionBill {
  id: number;
  sessionId: number;
  restaurantId: number;
  billNumber: string;
  subtotal: number;
  tax: number;
  total: number;
  status: "generated" | "sent" | "awaiting_verification" | "paid" | "cancelled";
  customerPhone: string | null;
  sentAt: string | null;
  hasScreenshot: boolean;
  screenshotReceivedAt: string | null;
  senderPhone: string | null;
  phoneMismatch: boolean;
  verifiedAt: string | null;
  verifiedBy: number | null;
  resentAt: string | null;
  resentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HistorySessionBill {
  id: number;
  sessionId: number;
  billNumber: string;
  subtotal: number;
  tax: number;
  total: number;
  status: "generated" | "sent" | "awaiting_verification" | "paid" | "cancelled";
  customerPhone: string | null;
  billGeneratedAt: string;
  billSentAt: string | null;
  screenshotReceivedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: number | null;
  verifiedByName: string | null;
  resentAt: string | null;
  resentCount: number;
  hasScreenshot: boolean;
}

export interface HistoryOrderItem {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  isVeg: boolean;
  notes: string | null;
}

export interface HistoryOrder {
  id: number;
  customerName: string;
  customerPhone: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentStatus: string;
  createdAt: string;
  items: HistoryOrderItem[];
}

export interface HistorySession {
  id: number;
  /** Null for takeaway sessions */
  tableNumber: string | null;
  sessionType: "dine_in" | "takeaway";
  status: "active" | "awaiting_payment" | "awaiting_verification" | "paid" | "closed";
  orderCount: number;
  itemCount: number;
  totalAmount: number;
  customerName: string | null;
  customerPhone: string | null;
  sessionOpenedAt: string;
  sessionClosedAt: string | null;
  bill: HistorySessionBill | null;
}

export interface HistorySessionDetail extends HistorySession {
  orders: HistoryOrder[];
}

export interface HistoryRevenue {
  today: number;
  thisWeek: number;
  thisMonth: number;
}

export interface HistoryPage {
  sessions: HistorySession[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SessionSummary {
  id: number;
  /** Null for takeaway sessions */
  tableNumber: string | null;
  sessionType: "dine_in" | "takeaway";
  /** Normalized phone used to group takeaway orders (e.g. "919876543210") */
  customerPhone: string | null;
  status: "active" | "awaiting_payment" | "awaiting_verification" | "paid" | "closed";
  orderCount: number;
  itemCount: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  orders: Order[];
  bill: SessionBill | null;
}

export interface Order {
  id: number;
  restaurantId: number;
  sessionId: number | null;
  tableId: number | null;
  tableNumber: string | null;
  customerName: string;
  customerPhone: string;
  status: "ordered" | "pending_payment" | "awaiting_confirmation" | "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled" | "payment_failed";
  subtotal: number;
  tax: number;
  total: number;
  paymentStatus: "unpaid" | "paid" | "manual_review" | "awaiting_verification";
  paymentMethod: string | null;
  notes: string | null;
  paymentScreenshotUrl: string | null;  // null in list responses — only present in individual order fetch
  hasScreenshot?: boolean;
  paymentOcrData: string | null;
  paymentVerificationStatus: string | null;
  verificationMethod: string | null;
  verifiedBy: number | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface DashboardStats {
  restaurantName: string | null;
  todayOrders: number;
  todayRevenue: number;
  activeOrders: number;
  pendingOrders: number;
  totalMenuItems: number;
  totalTables: number;
  subscriptionStatus: "active" | "exhausted" | "suspended" | "expired";
  customerLimit: number;
  customersUsed: number;
  subscriptionExpiresAt: string | null;
  subscriptionStartedAt: string | null;
  planId: number | null;
  hasPendingUpi: boolean;
  upiVerified: boolean;
  verifiedAt: string | null;
}

export interface RestaurantWithOwner extends Restaurant {
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  ownerTempPassword: string | null;
  totalOrders: number;
  totalRevenue: number;
  planName: string | null;
  subscriptionExpiresAt: string | null;
}

export interface AdminStats {
  totalRestaurants: number;
  activeRestaurants: number;
  suspendedRestaurants: number;
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  subscriptionRevenue: number;
  exhaustedRestaurants: number;
}

export interface AdminCustomer {
  customerPhone: string;
  customerName: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: string;
  restaurants: string[];
  state: string | null;
  district: string | null;
  city: string | null;
}

// ── Payment Screenshot Inbox (migration 0028) ─────────────────────────────────

export interface ScreenshotInboxEntry {
  id: number;
  restaurantId: number;
  receivedAt: string;
  senderJid: string | null;
  senderPhone: string | null;
  source: string;
  matchStatus: "matched" | "unmatched" | "ambiguous";
  matchedSessionId: number | null;
  matchedBillId: number | null;
  matchingStrategy: string | null;
  isDuplicate: boolean;
  /** True when screenshot_data is still present (not yet purged by retention policy) */
  hasScreenshot: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScreenshotInboxPage {
  entries: ScreenshotInboxEntry[];
  total: number;
  page: number;
  totalPages: number;
}
