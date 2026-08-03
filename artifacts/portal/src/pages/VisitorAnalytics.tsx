/**
 * VisitorAnalytics — Platform Admin Dashboard
 *
 * Displays visitor analytics for Bitebend platform pages.
 * Rendered inside Admin.tsx as the "analytics" section.
 *
 * Sections:
 *  1. Global date-range picker + refresh
 *  2. Summary stat cards (visitors, page views, online, bounce rate, avg duration, new/returning)
 *  3. Visitors over time (area chart)
 *  4. Traffic sources (bar) + New vs Returning (pie)
 *  5. Conversion funnel
 *  6. Campaign performance table
 *  7. Top pages table (with bounce rate + avg duration)
 *  8. WhatsApp Campaign Link Generator
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Users, Eye, TrendingUp, Globe, Smartphone, Wifi, RefreshCw,
  Loader2, CalendarDays, BarChart2, Hash, Clock, MousePointerClick,
  Download, Copy, Check, Link2, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  today: number;
  yesterday: number;
  thisWeek: number;
  thisMonth: number;
  total: number;
  totalPageViews: number;
  online: number;
  newVisitors: number;
  returning: number;
  bounceRate: number;
  avgDuration: number;
}

interface ChartPoint { label: string; visitors: number; pageViews: number; }
interface TrafficSource { source: string; visitors: number; }
interface TrafficData {
  sources: TrafficSource[];
  newVsReturning: { new: number; returning: number };
}

interface Campaign {
  campaign: string; source: string; medium: string;
  visitors: number; newVisitors: number; returningVisitors: number;
}

interface PageStat {
  page: string; views: number; visitors: number;
  bounceRate: number; avgDuration: number;
}

interface FunnelStep {
  id: string; label: string; count: number;
  conversionRate: number; dropOffRate: number;
}
interface FunnelData { steps: FunnelStep[]; rangeFrom: string; rangeTo: string; }

type ChartRange = "30d" | "12w" | "12m";
type ExportType = "visitors" | "pageviews" | "campaigns" | "pages";

// ── Date helpers ──────────────────────────────────────────────────────────────

function toInputDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function defaultRange(): { from: string; to: string } {
  const to   = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  return { from: toInputDate(from), to: toInputDate(to) };
}

function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ── Colour palettes ───────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  "WhatsApp":       "#25D366",
  "Facebook":       "#1877F2",
  "Instagram":      "#E1306C",
  "Twitter":        "#1DA1F2",
  "LinkedIn":       "#0A66C2",
  "YouTube":        "#FF0000",
  "Google Organic": "#34A853",
  "Google Ads":     "#FBBC04",
  "Bing":           "#008373",
  "DuckDuckGo":     "#DE5833",
  "Email":          "#8B5CF6",
  "SMS":            "#F59E0B",
  "Direct":         "#64748B",
  "Referral":       "#0EA5E9",
  "Unknown":        "#94A3B8",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, sub,
}: { label: string; value: string | number; icon: React.ElementType; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", color)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
      {children}
    </h3>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-40 text-slate-400 text-sm">{text}</div>;
}

// ── Export button ─────────────────────────────────────────────────────────────

function ExportButton({ type, from, to }: { type: ExportType; from: string; to: string }) {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ type, from, to });
      const resp = await fetch(`/api/platform/analytics/export?${params}`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Export failed");
      const blob  = await resp.blob();
      const url   = URL.createObjectURL(blob);
      const link  = document.createElement("a");
      const cd    = resp.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/);
      link.href     = url;
      link.download = match?.[1] ?? `${type}-export.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {/* silent */} finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={busy} className="gap-1.5 text-xs">
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
      Export CSV
    </Button>
  );
}

// ── WhatsApp Campaign Link Generator ─────────────────────────────────────────

const UTM_SOURCES = [
  { value: "whatsapp",   label: "WhatsApp"        },
  { value: "facebook",   label: "Facebook"         },
  { value: "instagram",  label: "Instagram"        },
  { value: "twitter",    label: "Twitter / X"      },
  { value: "linkedin",   label: "LinkedIn"         },
  { value: "email",      label: "Email Newsletter" },
  { value: "sms",        label: "SMS"              },
  { value: "google",     label: "Google"           },
  { value: "other",      label: "Other"            },
];

const DEFAULT_MEDIUM: Record<string, string> = {
  whatsapp:  "social",
  facebook:  "social",
  instagram: "social",
  twitter:   "social",
  linkedin:  "social",
  email:     "email",
  sms:       "sms",
  google:    "cpc",
  other:     "referral",
};

function CampaignLinkGenerator() {
  const [baseUrl,   setBaseUrl]   = useState(() => {
    try { return `${window.location.origin}/login`; } catch { return ""; }
  });
  const [campaign,  setCampaign]  = useState("");
  const [source,    setSource]    = useState("whatsapp");
  const [medium,    setMedium]    = useState("social");
  const [content,   setContent]   = useState("");
  const [copied,    setCopied]    = useState(false);
  const [showQr,    setShowQr]    = useState(false);

  // Auto-fill medium when source changes
  useEffect(() => {
    setMedium(DEFAULT_MEDIUM[source] ?? "referral");
  }, [source]);

  const generatedUrl = (() => {
    if (!baseUrl || !campaign) return "";
    try {
      const url = new URL(baseUrl);
      url.searchParams.set("utm_source",   source);
      url.searchParams.set("utm_medium",   medium);
      url.searchParams.set("utm_campaign", campaign.trim().toLowerCase().replace(/\s+/g, "_"));
      if (content.trim()) url.searchParams.set("utm_content", content.trim());
      return url.toString();
    } catch {
      return "";
    }
  })();

  const handleCopy = async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fieldCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <Link2 className="w-4 h-4 text-slate-500" />
        <SectionTitle>WhatsApp Campaign Link Generator</SectionTitle>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          {/* Base URL */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Destination URL
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://yourdomain.com/login"
              className={fieldCls}
            />
          </div>

          {/* Campaign name */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Campaign Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="e.g. Diwali Offer 2026"
              className={fieldCls}
            />
          </div>

          {/* Source */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Source
            </label>
            <div className="relative">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={cn(fieldCls, "appearance-none pr-8")}
              >
                {UTM_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          {/* Medium */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Medium
            </label>
            <input
              type="text"
              value={medium}
              onChange={(e) => setMedium(e.target.value)}
              placeholder="social / email / sms"
              className={fieldCls}
            />
          </div>

          {/* Content (optional) */}
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Content <span className="text-slate-400 font-normal">(optional — identifies which ad or link variant)</span>
            </label>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. hero_banner_v2"
              className={fieldCls}
            />
          </div>
        </div>

        {/* Generated URL preview */}
        {generatedUrl ? (
          <div className="space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-2">
              <code className="text-xs text-slate-700 break-all flex-1">{generatedUrl}</code>
              <button
                onClick={handleCopy}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors",
                  copied
                    ? "bg-green-100 text-green-700"
                    : "bg-orange-100 text-orange-700 hover:bg-orange-200",
                )}
              >
                {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowQr((v) => !v)}
                className="text-xs text-orange-600 font-medium hover:underline"
              >
                {showQr ? "Hide QR Code" : "Show QR Code"}
              </button>
            </div>

            {showQr && (
              <div className="inline-block p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                <QRCodeSVG value={generatedUrl} size={160} />
                <p className="text-xs text-slate-400 text-center mt-2">Scan to visit</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Fill in Destination URL and Campaign Name to generate a link.</p>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function VisitorAnalyticsDashboard() {
  const { from: initFrom, to: initTo } = defaultRange();
  const [dateFrom,   setDateFrom]   = useState(initFrom);
  const [dateTo,     setDateTo]     = useState(initTo);
  const [dashboard,  setDashboard]  = useState<DashboardData | null>(null);
  const [chartData,  setChartData]  = useState<ChartPoint[]>([]);
  const [traffic,    setTraffic]    = useState<TrafficData | null>(null);
  const [campaigns,  setCampaigns]  = useState<Campaign[]>([]);
  const [pages,      setPages]      = useState<PageStat[]>([]);
  const [funnel,     setFunnel]     = useState<FunnelData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>("30d");
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const range = `from=${dateFrom}&to=${dateTo}`;
    try {
      const [dash, chart, traf, camp, pgs, fun] = await Promise.all([
        apiFetch<DashboardData>(`/platform/analytics/dashboard?${range}`),
        apiFetch<ChartPoint[]>(`/platform/analytics/chart?range=${chartRange}&${range}`),
        apiFetch<TrafficData>(`/platform/analytics/traffic?${range}`),
        apiFetch<Campaign[]>(`/platform/analytics/campaigns?${range}`),
        apiFetch<PageStat[]>(`/platform/analytics/pages?${range}`),
        apiFetch<FunnelData>(`/platform/analytics/funnel?${range}`),
      ]);
      setDashboard(dash);
      setChartData(chart);
      setTraffic(traf);
      setCampaigns(camp);
      setPages(pgs);
      setFunnel(fun);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, chartRange]);

  // Initial load + auto-refresh every 60 s
  useEffect(() => {
    fetchAll();
    refreshRef.current = setInterval(fetchAll, 60_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchAll]);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading && !dashboard) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
        {error}
        <Button variant="outline" size="sm" className="ml-4" onClick={fetchAll}>Retry</Button>
      </div>
    );
  }

  const nvr     = traffic?.newVsReturning;
  const nvrData = nvr ? [{ name: "New", value: nvr.new }, { name: "Returning", value: nvr.returning }] : [];

  const funnelChartData = funnel?.steps.map((s) => ({
    name:  s.label,
    value: s.count,
  })) ?? [];

  return (
    <div className="space-y-8">

      {/* ── Header: date range + refresh ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date range</span>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <span className="text-slate-400 text-xs">→</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={toInputDate(new Date())}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          {/* Preset shortcuts */}
          {(
            [
              { label: "7D",  days: 7  },
              { label: "30D", days: 30 },
              { label: "90D", days: 90 },
            ] as { label: string; days: number }[]
          ).map(({ label, days }) => (
            <button
              key={days}
              onClick={() => {
                const to   = new Date();
                const from = new Date(to.getTime() - days * 86_400_000);
                setDateFrom(toInputDate(from));
                setDateTo(toInputDate(to));
              }}
              className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-orange-400" />}
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Today"         value={dashboard?.today       ?? 0} icon={CalendarDays} color="bg-orange-100 text-orange-600" />
        <StatCard label="Yesterday"     value={dashboard?.yesterday   ?? 0} icon={CalendarDays} color="bg-amber-100 text-amber-600" />
        <StatCard label="This Week"     value={dashboard?.thisWeek    ?? 0} icon={TrendingUp}   color="bg-blue-100 text-blue-600" />
        <StatCard label="This Month"    value={dashboard?.thisMonth   ?? 0} icon={BarChart2}    color="bg-violet-100 text-violet-600" />
        <StatCard label="Total Visitors"value={dashboard?.total       ?? 0} icon={Users}        color="bg-slate-100 text-slate-600" />
        <StatCard label="Total Page Views" value={dashboard?.totalPageViews ?? 0} icon={Eye}    color="bg-indigo-100 text-indigo-600" />
        <StatCard label="Online Now"    value={dashboard?.online      ?? 0} icon={Wifi}         color="bg-green-100 text-green-600"   sub="Active in last 5 min" />
        <StatCard
          label="Bounce Rate"
          value={`${dashboard?.bounceRate ?? 0}%`}
          icon={MousePointerClick}
          color="bg-rose-100 text-rose-600"
          sub="Single-page sessions"
        />
        <StatCard
          label="Avg Duration"
          value={fmtDuration(dashboard?.avgDuration ?? 0)}
          icon={Clock}
          color="bg-teal-100 text-teal-600"
          sub="Time on page"
        />
        <StatCard label="New Visitors"  value={dashboard?.newVisitors ?? 0} icon={Globe}        color="bg-cyan-100 text-cyan-600" />
        <StatCard label="Returning"     value={dashboard?.returning   ?? 0} icon={Smartphone}   color="bg-pink-100 text-pink-600" />
      </div>

      {/* ── Visitors over time chart ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Visitors Over Time</SectionTitle>
          <div className="flex gap-1">
            {(["30d", "12w", "12m"] as ChartRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-md font-medium transition-colors",
                  chartRange === r
                    ? "bg-orange-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {r === "30d" ? "30 Days" : r === "12w" ? "12 Weeks" : "12 Months"}
              </button>
            ))}
          </div>
        </div>
        {chartData.length === 0 ? <EmptyState text="No data yet" /> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="visGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#F97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                formatter={(val: number, name: string) => [
                  val.toLocaleString(),
                  name === "visitors" ? "Visitors" : "Page Views",
                ]}
              />
              <Area type="monotone" dataKey="visitors"  stroke="#F97316" fill="url(#visGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="pageViews" stroke="#FB923C" fill="none" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Traffic sources + New vs Returning ──────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Traffic sources */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <SectionTitle>Traffic Sources</SectionTitle>
          {!traffic?.sources.length ? <EmptyState text="No traffic data yet" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={traffic.sources}
                layout="vertical"
                margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  formatter={(val: number) => [val.toLocaleString(), "Visitors"]}
                />
                <Bar dataKey="visitors" radius={[0, 4, 4, 0]}>
                  {traffic.sources.map((s) => (
                    <Cell key={s.source} fill={SOURCE_COLORS[s.source] ?? "#94A3B8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* New vs Returning pie */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <SectionTitle>New vs Returning</SectionTitle>
          {nvrData.every((d) => d.value === 0) ? <EmptyState text="No data yet" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={nvrData}
                  cx="50%" cy="45%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  <Cell fill="#F97316" />
                  <Cell fill="#94A3B8" />
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  formatter={(val: number) => [val.toLocaleString(), ""]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Conversion Funnel ────────────────────────────────────────────────── */}
      {funnel && funnel.steps.some((s) => s.count > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Conversion Funnel</SectionTitle>
          </div>
          <div className="space-y-2">
            {funnel.steps.map((step, i) => {
              const maxCount = funnel.steps[0]?.count ?? 1;
              const pct = maxCount > 0 ? Math.round((step.count / maxCount) * 100) : 0;
              return (
                <div key={step.id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-6 text-right font-mono">{i + 1}.</span>
                  <span className="text-xs text-slate-700 w-44 shrink-0 truncate">{step.label}</span>
                  <div className="flex-1 relative h-7 bg-slate-100 rounded-md overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full bg-orange-400 rounded-md transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-white mix-blend-darken">
                      {step.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-right w-28 shrink-0">
                    <span className="text-xs font-semibold text-slate-700">{step.conversionRate}%</span>
                    {i > 0 && step.dropOffRate > 0 && (
                      <span className="ml-1.5 text-xs text-rose-500">−{step.dropOffRate}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Conversion % is relative to step 1. Drop-off % is relative to the previous step.
          </p>
          <p className="text-xs text-slate-300 mt-1">
            Register/plan events are emitted by the portal UI via <code className="bg-slate-100 px-1 rounded">trackEvent()</code>.
            Only step 1 (Login Page) is counted immediately.
          </p>
        </div>
      )}

      {/* ── Campaign Performance ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-slate-500" />
            <SectionTitle>Campaign Performance</SectionTitle>
          </div>
          <ExportButton type="campaigns" from={dateFrom} to={dateTo} />
        </div>
        {campaigns.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-400 text-center">
            No campaign data yet. Use{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">?utm_campaign=...</code>{" "}
            links to track campaigns.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Campaign</th>
                  <th className="text-left px-4 py-3 font-semibold">Source</th>
                  <th className="text-right px-4 py-3 font-semibold">Visitors</th>
                  <th className="text-right px-4 py-3 font-semibold">New</th>
                  <th className="text-right px-6 py-3 font-semibold">Returning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr key={`${c.campaign}-${c.source}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-800">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: SOURCE_COLORS[c.source] ?? "#94A3B8" }}
                        />
                        {c.campaign}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{c.source}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{c.visitors.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{c.newVisitors.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-slate-500">{c.returningVisitors.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Top Pages ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-500" />
            <SectionTitle>Top Landing Pages</SectionTitle>
          </div>
          <ExportButton type="pages" from={dateFrom} to={dateTo} />
        </div>
        {pages.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-400 text-center">No page data yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Page</th>
                  <th className="text-right px-4 py-3 font-semibold">Views</th>
                  <th className="text-right px-4 py-3 font-semibold">Visitors</th>
                  <th className="text-right px-4 py-3 font-semibold">Bounce</th>
                  <th className="text-right px-6 py-3 font-semibold">Avg Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pages.map((p) => (
                  <tr key={p.page} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-slate-700">{p.page}</td>
                    <td className="px-4 py-3 text-right text-slate-800">{p.views.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{p.visitors.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "text-xs font-semibold",
                        p.bounceRate >= 70 ? "text-rose-500" :
                        p.bounceRate >= 40 ? "text-amber-500" : "text-emerald-600",
                      )}>
                        {p.bounceRate}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-500 text-xs">{fmtDuration(p.avgDuration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── WhatsApp Campaign Link Generator ────────────────────────────────── */}
      <CampaignLinkGenerator />

      {/* ── Visitors export ─────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-2 pb-2">
        <ExportButton type="visitors"  from={dateFrom} to={dateTo} />
        <ExportButton type="pageviews" from={dateFrom} to={dateTo} />
      </div>
    </div>
  );
}
