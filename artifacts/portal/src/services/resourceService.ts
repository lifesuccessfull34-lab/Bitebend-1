// ── Resource Service ──────────────────────────────────────────────────────────
// Manages client-side state for Resources Center:
//   - favorites (localStorage)
//   - history / continue-learning (localStorage)
//   - analytics tracking (localStorage + future API)
//   - search utility (in-memory)
//
// Platform resources are fetched from GET /api/resources.
// Only Super Admin-approved content appears; there is no hardcoded data here.

// ── Types ────────────────────────────────────────────────────────────────────

export type ResourceType = "video" | "pdf" | "link" | "plan" | "faq";
export type ResourceStatus = "draft" | "active" | "archived";

export interface Resource {
  id: number;
  title: string;
  description: string | null;
  type: ResourceType;
  category: string | null;
  thumbnail?: string | null;
  url: string | null;
  fileUrl?: string | null;
  tags: string[];
  featured: boolean;
  displayOrder: number;
  status: ResourceStatus;
  createdAt: string;
  updatedAt: string;
  // Video-specific
  duration?: string | null;
  videoSource?: "youtube" | "external" | "self-hosted" | null;
  // PDF-specific
  sizeLabel?: string | null;
  // Plan-specific
  planName?: string | null;
  planPrice?: string | null;
  planPeriod?: string | null;
  planFeatures?: string[] | null;
  planHighlight?: boolean | null;
  planBadge?: string | null;
  planCta?: "trial" | "contact" | null;
  // Link-specific
  iconName?: string | null;
  iconColor?: string | null;
  // FAQ-specific
  question?: string | null;
  answer?: string | null;
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

// ── localStorage helpers ──────────────────────────────────────────────────────

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
// Notifications will come from the API in a future iteration.
// dismissed-IDs key is kept for forward-compat with the UI.

export function getNotifications(): ResourceNotification[] {
  return [];
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
    if ((r.description ?? "").toLowerCase().includes(q)) return true;
    if ((r.category ?? "").toLowerCase().includes(q)) return true;
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
