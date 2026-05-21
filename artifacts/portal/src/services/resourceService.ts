// ── Resource Service ──────────────────────────────────────────────────────────
// Central service for resource management. Uses mock data stored in-memory with
// localStorage persistence for user-created resources.
// When a real backend is ready, swap getResources/createResource/etc. with API
// calls — all consumers use this service, so no other files need to change.

// ── Types ────────────────────────────────────────────────────────────────────

export type ResourceType = "video" | "pdf" | "link" | "plan" | "faq";
export type ResourceStatus = "active" | "inactive";

export interface Resource {
  id: number;
  title: string;
  description: string;
  type: ResourceType;
  category: string;
  thumbnail?: string;
  url: string;
  fileUrl?: string;
  tags: string[];
  featured: boolean;
  displayOrder: number;
  status: ResourceStatus;
  createdAt: string;
  updatedAt: string;
  // Video-specific
  duration?: string;
  videoSource?: "youtube" | "external" | "self-hosted";
  // PDF-specific
  sizeLabel?: string;
  // Plan-specific
  planName?: string;
  planPrice?: string;
  planPeriod?: string;
  planFeatures?: string[];
  planHighlight?: boolean;
  planBadge?: string;
  planCta?: "trial" | "contact";
  // Link-specific
  iconName?: string;
  iconColor?: string;
  // FAQ-specific
  question?: string;
  answer?: string;
}

export interface HistoryEntry {
  resourceId: number;
  openedAt: string;
  progress?: number;
}

export interface ResourceNotification {
  id: string;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
  createdAt: string;
}

export interface Analytics {
  opens: Record<number, number>;
  downloads: Record<number, number>;
  plays: Record<number, number>;
}

// ── Mock data ─────────────────────────────────────────────────────────────────
// Dates relative to today (May 21 2026):
//   May 20 = 1 day ago  → "New" badge
//   May 16 = 5 days ago → "New" badge
//   Apr    = ~3–4 weeks ago → regular
//   Mar    = ~7–8 weeks ago → regular

const MOCK_RESOURCES: Resource[] = [
  // ── Videos ──────────────────────────────────────────────────────────────
  {
    id: 1,
    type: "video",
    title: "QR Ordering Demo",
    description: "See how customers scan a QR code and place orders directly from their table — no app required.",
    category: "Onboarding",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    duration: "3:24",
    videoSource: "youtube",
    tags: ["qr", "demo", "ordering", "customer"],
    featured: true,
    displayOrder: 1,
    status: "active",
    createdAt: "2026-05-20T10:00:00Z",
    updatedAt: "2026-05-20T10:00:00Z",
  },
  {
    id: 2,
    type: "video",
    title: "Restaurant Dashboard Tutorial",
    description: "A complete walkthrough of the owner dashboard — managing orders, tables, and live updates.",
    category: "Dashboard",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    duration: "7:15",
    videoSource: "youtube",
    tags: ["dashboard", "tutorial", "orders", "management"],
    featured: false,
    displayOrder: 2,
    status: "active",
    createdAt: "2026-04-10T09:00:00Z",
    updatedAt: "2026-04-10T09:00:00Z",
  },
  {
    id: 3,
    type: "video",
    title: "Customer Ordering Flow",
    description: "End-to-end customer experience from scanning the QR to receiving order confirmation.",
    category: "Customer",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    duration: "2:48",
    videoSource: "youtube",
    tags: ["customer", "flow", "ordering", "experience"],
    featured: false,
    displayOrder: 3,
    status: "active",
    createdAt: "2026-03-15T08:00:00Z",
    updatedAt: "2026-03-15T08:00:00Z",
  },
  {
    id: 4,
    type: "video",
    title: "Payment Setup Guide",
    description: "Configure UPI and Razorpay payments, test transactions, and go live with payments.",
    category: "Payments",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    duration: "5:01",
    videoSource: "youtube",
    tags: ["upi", "razorpay", "payments", "setup", "tutorial"],
    featured: true,
    displayOrder: 4,
    status: "active",
    createdAt: "2026-05-16T14:00:00Z",
    updatedAt: "2026-05-16T14:00:00Z",
  },
  {
    id: 5,
    type: "video",
    title: "Bitebend Full Product Walkthrough",
    description: "A comprehensive demo covering every feature — menu, tables, orders, payments, and admin panel.",
    category: "Onboarding",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    duration: "14:32",
    videoSource: "youtube",
    tags: ["walkthrough", "demo", "complete", "onboarding"],
    featured: false,
    displayOrder: 5,
    status: "active",
    createdAt: "2026-03-01T12:00:00Z",
    updatedAt: "2026-03-01T12:00:00Z",
  },

  // ── PDFs ─────────────────────────────────────────────────────────────────
  {
    id: 10,
    type: "pdf",
    title: "Restaurant Setup Guide",
    description: "Step-by-step instructions for configuring your restaurant, menu, and tables.",
    category: "Setup",
    url: "/docs/setup-guide.pdf",
    sizeLabel: "2.4 MB",
    tags: ["setup", "guide", "menu", "tables"],
    featured: true,
    displayOrder: 10,
    status: "active",
    createdAt: "2026-05-20T11:00:00Z",
    updatedAt: "2026-05-20T11:00:00Z",
  },
  {
    id: 11,
    type: "pdf",
    title: "Bitebend Product Brochure",
    description: "Share this one-pager with your team. Covers all features and benefits at a glance.",
    category: "Marketing",
    url: "/docs/brochure.pdf",
    sizeLabel: "1.1 MB",
    tags: ["brochure", "features", "marketing"],
    featured: false,
    displayOrder: 11,
    status: "active",
    createdAt: "2026-04-05T10:00:00Z",
    updatedAt: "2026-04-05T10:00:00Z",
  },
  {
    id: 12,
    type: "pdf",
    title: "QR Setup Manual",
    description: "How to generate, print, and place QR codes on tables for customers to scan.",
    category: "Setup",
    url: "/docs/qr-setup.pdf",
    sizeLabel: "0.8 MB",
    tags: ["qr", "setup", "print", "tables"],
    featured: false,
    displayOrder: 12,
    status: "active",
    createdAt: "2026-03-20T09:00:00Z",
    updatedAt: "2026-03-20T09:00:00Z",
  },
  {
    id: 13,
    type: "pdf",
    title: "Pricing Details",
    description: "Full breakdown of subscription plans, customer quotas, and add-on options.",
    category: "Billing",
    url: "/docs/pricing.pdf",
    sizeLabel: "0.5 MB",
    tags: ["pricing", "plans", "subscription", "billing"],
    featured: false,
    displayOrder: 13,
    status: "active",
    createdAt: "2026-04-01T08:00:00Z",
    updatedAt: "2026-04-01T08:00:00Z",
  },
  {
    id: 14,
    type: "pdf",
    title: "Terms & Policies",
    description: "Platform terms of service, privacy policy, and refund policy in one document.",
    category: "Legal",
    url: "/docs/terms-policies.pdf",
    sizeLabel: "1.8 MB",
    tags: ["terms", "privacy", "legal", "policy"],
    featured: false,
    displayOrder: 14,
    status: "active",
    createdAt: "2026-03-10T07:00:00Z",
    updatedAt: "2026-03-10T07:00:00Z",
  },

  // ── Links ─────────────────────────────────────────────────────────────────
  {
    id: 20,
    type: "link",
    title: "Book a Demo",
    description: "Schedule a free 30-minute walkthrough with our team.",
    category: "Support",
    url: "https://calendly.com/bitebend",
    iconName: "calendar",
    iconColor: "bg-blue-50 text-blue-600 border-blue-200",
    tags: ["demo", "support", "onboarding"],
    featured: false,
    displayOrder: 20,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 21,
    type: "link",
    title: "WhatsApp Support",
    description: "Chat with our support team directly on WhatsApp — typically responds in under 1 hour.",
    category: "Support",
    url: "https://wa.me/919999999999?text=Hi%20Bitebend%20Support",
    iconName: "message-circle",
    iconColor: "bg-green-50 text-green-600 border-green-200",
    tags: ["support", "whatsapp", "help"],
    featured: false,
    displayOrder: 21,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 22,
    type: "link",
    title: "FAQ",
    description: "Answers to the most common questions from restaurant owners.",
    category: "Support",
    url: "#faq",
    iconName: "help-circle",
    iconColor: "bg-amber-50 text-amber-600 border-amber-200",
    tags: ["faq", "help", "questions"],
    featured: false,
    displayOrder: 22,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 23,
    type: "link",
    title: "Website",
    description: "Visit the official Bitebend website to learn more about our platform.",
    category: "Company",
    url: "https://bitebend.in",
    iconName: "globe",
    iconColor: "bg-orange-50 text-orange-600 border-orange-200",
    tags: ["website", "company"],
    featured: false,
    displayOrder: 23,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 24,
    type: "link",
    title: "YouTube Channel",
    description: "Watch tutorials, demos, and tips for getting the most out of Bitebend.",
    category: "Learning",
    url: "https://youtube.com/@bitebend",
    iconName: "play-circle",
    iconColor: "bg-red-50 text-red-600 border-red-200",
    tags: ["youtube", "tutorials", "videos"],
    featured: false,
    displayOrder: 24,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 25,
    type: "link",
    title: "Contact Us",
    description: "Reach out by email for billing, partnerships, or technical queries.",
    category: "Support",
    url: "mailto:support@bitebend.in",
    iconName: "mail",
    iconColor: "bg-purple-50 text-purple-600 border-purple-200",
    tags: ["contact", "email", "support"],
    featured: false,
    displayOrder: 25,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },

  // ── Plans ─────────────────────────────────────────────────────────────────
  {
    id: 30,
    type: "plan",
    title: "Starter Plan",
    description: "Perfect for new restaurants just getting started with digital ordering.",
    category: "Billing",
    url: "/restaurant/subscription",
    planName: "Starter",
    planPrice: "₹199",
    planPeriod: "per 500 customers",
    planFeatures: [
      "Up to 500 unique customers",
      "QR table ordering",
      "Basic menu management",
      "UPI & cash payments",
      "WhatsApp bill sharing",
    ],
    planCta: "trial",
    tags: ["starter", "pricing", "plan"],
    featured: false,
    displayOrder: 30,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 31,
    type: "plan",
    title: "Growth Plan",
    description: "Great for growing restaurants that need more capacity and analytics.",
    category: "Billing",
    url: "/restaurant/subscription",
    planName: "Growth",
    planPrice: "₹499",
    planPeriod: "per 2,000 customers",
    planFeatures: [
      "Up to 2,000 unique customers",
      "Everything in Starter",
      "Customer analytics",
      "Razorpay integration",
      "Priority support",
    ],
    planCta: "trial",
    planHighlight: true,
    planBadge: "Most Popular",
    tags: ["growth", "pricing", "plan", "popular"],
    featured: false,
    displayOrder: 31,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 32,
    type: "plan",
    title: "Unlimited Plan",
    description: "For high-volume restaurants that need no limits and full platform access.",
    category: "Billing",
    url: "/restaurant/subscription",
    planName: "Unlimited",
    planPrice: "₹1,999",
    planPeriod: "unlimited customers",
    planFeatures: [
      "Unlimited unique customers",
      "Everything in Growth",
      "Admin panel access",
      "Dedicated onboarding",
      "Custom integrations",
    ],
    planCta: "contact",
    planBadge: "Best Value",
    tags: ["unlimited", "pricing", "plan"],
    featured: false,
    displayOrder: 32,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },

  // ── FAQs ─────────────────────────────────────────────────────────────────
  {
    id: 40,
    type: "faq",
    title: "How does QR ordering work?",
    description: "Each table gets a unique QR code. Customers scan → browse → order. No app needed.",
    category: "Ordering",
    url: "#faq",
    question: "How does QR ordering work?",
    answer:
      "Each table gets a unique QR code generated by Bitebend. When a customer scans it with their phone camera, they're taken directly to your digital menu. They can browse, add items to cart, and place an order — all without downloading any app. The order appears instantly on your dashboard.",
    tags: ["qr", "ordering", "customer"],
    featured: false,
    displayOrder: 40,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 41,
    type: "faq",
    title: "How are payments settled?",
    description: "Cash, Personal UPI, and Razorpay — three ways to collect payment.",
    category: "Payments",
    url: "#faq",
    question: "How are payments settled?",
    answer:
      "Bitebend supports three payment methods: Cash, Personal UPI (customer pays to your UPI ID and you verify the UTR), and Razorpay (online card/UPI payments processed automatically). For Razorpay, settlements go directly to your linked bank account.",
    tags: ["payments", "upi", "razorpay", "settlement"],
    featured: false,
    displayOrder: 41,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 42,
    type: "faq",
    title: "How long does onboarding take?",
    description: "Most restaurants are live within 30–60 minutes.",
    category: "Setup",
    url: "#faq",
    question: "How long does onboarding take?",
    answer:
      "Most restaurants are fully live within 30–60 minutes. You'll need to create your account, add menu categories and items, set up tables and generate QR codes, configure your payment method, and print the QR codes. Our setup guide walks you through every step.",
    tags: ["onboarding", "setup", "getting started"],
    featured: false,
    displayOrder: 42,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 43,
    type: "faq",
    title: "Can customers pay inside Bitebend?",
    description: "Yes — UPI (deep link), Razorpay, or cash at the counter.",
    category: "Payments",
    url: "#faq",
    question: "Can customers pay inside Bitebend?",
    answer:
      "Yes. Customers can pay via UPI (any UPI app — GPay, PhonePe, Paytm) directly from the ordering page if you have Personal UPI or Razorpay enabled. Cash is always available as a fallback.",
    tags: ["payments", "upi", "customer"],
    featured: false,
    displayOrder: 43,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
  {
    id: 44,
    type: "faq",
    title: "Is UPI supported?",
    description: "Yes — Personal UPI with deep link + QR, or automated Razorpay UPI.",
    category: "Payments",
    url: "#faq",
    question: "Is UPI supported?",
    answer:
      "Yes. Bitebend supports two UPI flows. Personal UPI lets customers pay directly to your restaurant's UPI ID — the app generates a UPI deep link and QR code so GPay, PhonePe, or Paytm open automatically with the amount prefilled. The customer shares their UTR reference and you verify it from the dashboard. Razorpay integration handles automated UPI collection with instant verification.",
    tags: ["upi", "payments", "gpay", "phonepe", "paytm"],
    featured: false,
    displayOrder: 44,
    status: "active",
    createdAt: "2026-03-01T06:00:00Z",
    updatedAt: "2026-03-01T06:00:00Z",
  },
];

const MOCK_NOTIFICATIONS: ResourceNotification[] = [
  {
    id: "notif_1",
    title: "New: UPI Payment Tutorial",
    message: "A new video guide on setting up UPI payments has been added to the Resources Center.",
    ctaLabel: "Watch now",
    ctaUrl: "#videos",
    createdAt: "2026-05-20T10:00:00Z",
  },
];

// ── In-memory store ───────────────────────────────────────────────────────────

const LS_CUSTOM = "bb:resources_custom";
const LS_ANALYTICS = "bb:resources_analytics";
const LS_FAVORITES = "bb:resources_favorites";
const LS_HISTORY = "bb:resources_history";
const LS_DISMISSED_NOTIFS = "bb:resources_dismissed_notifs";

function lsRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

function loadResources(): Resource[] {
  const custom = lsRead<Resource[]>(LS_CUSTOM, []);
  const existingIds = new Set(MOCK_RESOURCES.map((r) => r.id));
  // Get updated mock resources (admin may have updated their displayOrder/featured via manage)
  const updates = lsRead<Record<number, Partial<Resource>>>("bb:resources_updates", {});
  const mocks = MOCK_RESOURCES.map((r) => ({ ...r, ...(updates[r.id] ?? {}) }));
  return [
    ...mocks,
    ...custom.filter((r) => !existingIds.has(r.id)),
  ].sort((a, b) => a.displayOrder - b.displayOrder);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getResources(filter?: {
  type?: ResourceType;
  status?: ResourceStatus;
  featured?: boolean;
}): Resource[] {
  let rs = loadResources();
  if (filter?.type) rs = rs.filter((r) => r.type === filter.type);
  if (filter?.status) rs = rs.filter((r) => r.status === filter.status);
  if (filter?.featured !== undefined) rs = rs.filter((r) => r.featured === filter.featured);
  return rs;
}

export function createResource(data: Omit<Resource, "id" | "createdAt" | "updatedAt">): Resource {
  const custom = lsRead<Resource[]>(LS_CUSTOM, []);
  const now = new Date().toISOString();
  const newRes: Resource = {
    ...data,
    id: Date.now(),
    createdAt: now,
    updatedAt: now,
  };
  lsWrite(LS_CUSTOM, [...custom, newRes]);
  return newRes;
}

export function updateResource(id: number, data: Partial<Resource>): Resource | null {
  const now = new Date().toISOString();
  const isMock = MOCK_RESOURCES.some((r) => r.id === id);

  if (isMock) {
    const updates = lsRead<Record<number, Partial<Resource>>>("bb:resources_updates", {});
    updates[id] = { ...(updates[id] ?? {}), ...data, updatedAt: now };
    lsWrite("bb:resources_updates", updates);
    const base = MOCK_RESOURCES.find((r) => r.id === id)!;
    return { ...base, ...updates[id] };
  }

  const custom = lsRead<Resource[]>(LS_CUSTOM, []);
  const idx = custom.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  custom[idx] = { ...custom[idx], ...data, updatedAt: now };
  lsWrite(LS_CUSTOM, custom);
  return custom[idx];
}

export function deleteResource(id: number): void {
  const custom = lsRead<Resource[]>(LS_CUSTOM, []);
  lsWrite(LS_CUSTOM, custom.filter((r) => r.id !== id));
  // For mock resources, mark as inactive via update
  const isMock = MOCK_RESOURCES.some((r) => r.id === id);
  if (isMock) updateResource(id, { status: "inactive" });
}

export function reorderResources(orderedIds: number[]): void {
  orderedIds.forEach((id, idx) => {
    updateResource(id, { displayOrder: idx });
  });
}

// ── Favorites ─────────────────────────────────────────────────────────────────

export function getFavorites(): number[] {
  return lsRead<number[]>(LS_FAVORITES, []);
}

export function isFavorite(id: number): boolean {
  return getFavorites().includes(id);
}

export function toggleFavorite(id: number): boolean {
  const favs = getFavorites();
  const already = favs.includes(id);
  lsWrite(LS_FAVORITES, already ? favs.filter((f) => f !== id) : [...favs, id]);
  return !already;
}

// ── History ───────────────────────────────────────────────────────────────────

export function getHistory(): HistoryEntry[] {
  return lsRead<HistoryEntry[]>(LS_HISTORY, []);
}

export function addToHistory(resourceId: number, progress?: number): void {
  const history = getHistory().filter((h) => h.resourceId !== resourceId);
  history.unshift({ resourceId, openedAt: new Date().toISOString(), progress });
  lsWrite(LS_HISTORY, history.slice(0, 20));
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export function getAnalytics(): Analytics {
  return lsRead<Analytics>(LS_ANALYTICS, { opens: {}, downloads: {}, plays: {} });
}

function bumpAnalytic(key: keyof Analytics, id: number): void {
  const a = getAnalytics();
  a[key][id] = (a[key][id] ?? 0) + 1;
  lsWrite(LS_ANALYTICS, a);
  // TODO: POST /api/admin/resource-analytics when backend is ready
  console.log(`[ResourceAnalytics] ${key} +1 for resource #${id}`, a[key][id]);
}

export function trackResourceOpen(id: number): void {
  addToHistory(id);
  bumpAnalytic("opens", id);
}

export function trackDownload(id: number): void {
  bumpAnalytic("downloads", id);
}

export function trackVideoPlay(id: number): void {
  bumpAnalytic("plays", id);
}

// ── Notifications ─────────────────────────────────────────────────────────────

export function getNotifications(): ResourceNotification[] {
  const dismissed = lsRead<string[]>(LS_DISMISSED_NOTIFS, []);
  return MOCK_NOTIFICATIONS.filter((n) => !dismissed.includes(n.id));
}

export function dismissNotification(id: string): void {
  const dismissed = lsRead<string[]>(LS_DISMISSED_NOTIFS, []);
  if (!dismissed.includes(id)) lsWrite(LS_DISMISSED_NOTIFS, [...dismissed, id]);
}

// ── Search ────────────────────────────────────────────────────────────────────
// Supports: substring (title, description, category), tag matching, fuzzy on title.

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const found = t.indexOf(q[qi], ti);
    if (found === -1) return false;
    ti = found + 1;
  }
  return true;
}

export function searchResources(resources: Resource[], query: string): Resource[] {
  if (!query.trim()) return resources;
  const q = query.trim().toLowerCase();
  return resources.filter((r) => {
    if (r.title.toLowerCase().includes(q)) return true;
    if (r.description.toLowerCase().includes(q)) return true;
    if (r.category.toLowerCase().includes(q)) return true;
    if (r.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
    if (r.type === "faq" && r.question?.toLowerCase().includes(q)) return true;
    if (r.type === "faq" && r.answer?.toLowerCase().includes(q)) return true;
    if (r.type === "plan" && r.planFeatures?.some((f) => f.toLowerCase().includes(q))) return true;
    if (q.length >= 3 && fuzzyMatch(r.title, q)) return true;
    return false;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function isNew(resource: Resource): boolean {
  return Date.now() - new Date(resource.createdAt).getTime() < SEVEN_DAYS_MS;
}

export function isRecent(resource: Resource): boolean {
  return Date.now() - new Date(resource.createdAt).getTime() < THIRTY_DAYS_MS;
}

export function timeAgo(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
