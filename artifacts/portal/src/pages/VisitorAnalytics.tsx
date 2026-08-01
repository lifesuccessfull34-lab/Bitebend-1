/**
 * VisitorAnalytics — Platform Admin Dashboard
 *
 * Displays visitor analytics for Bitebend platform pages.
 * Rendered as the "analytics" section inside Admin.tsx.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Users,
  Eye,
  TrendingUp,
  Globe,
  Smartphone,
  Wifi,
  RefreshCw,
  Loader2,
  CalendarDays,
  BarChart2,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  today: number;
  yesterday: number;
  thisWeek: number;
  thisMonth: number;
  total: number;
  online: number;
  newVisitors: number;
  returning: number;
}

interface ChartPoint {
  label: string;
  visitors: number;
  pageViews: number;
}

interface TrafficSource {
  source: string;
  visitors: number;
}

interface TrafficData {
  sources: TrafficSource[];
  newVsReturning: { new: number; returning: number };
}

interface Campaign {
  campaign: string;
  source: string;
  medium: string;
  visitors: number;
  newVisitors: number;
  returningVisitors: number;
}

interface PageStat {
  page: string;
  views: number;
  visitors: number;
}

type ChartRange = "30d" | "12w" | "12m";

// ── Colour palette ─────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  WhatsApp:  "#25D366",
  Facebook:  "#1877F2",
  Instagram: "#E1306C",
  Google:    "#EA4335",
  Direct:    "#F59E0B",
  Referral:  "#8B5CF6",
  Unknown:   "#94A3B8",
};

const CHART_COLORS = ["#F97316", "#FB923C", "#FDBA74"];

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", color)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value.toLocaleString()}</p>
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
  return (
    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">{text}</div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function VisitorAnalyticsDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [traffic, setTraffic] = useState<TrafficData | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pages, setPages] = useState<PageStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>("30d");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dash, chart, traf, camp, pgs] = await Promise.all([
        apiFetch<DashboardData>("/platform/analytics/dashboard"),
        apiFetch<ChartPoint[]>(`/platform/analytics/chart?range=${chartRange}`),
        apiFetch<TrafficData>("/platform/analytics/traffic"),
        apiFetch<Campaign[]>("/platform/analytics/campaigns"),
        apiFetch<PageStat[]>("/platform/analytics/pages"),
      ]);
      setDashboard(dash);
      setChartData(chart);
      setTraffic(traf);
      setCampaigns(camp);
      setPages(pgs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [chartRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
        {error}
        <Button variant="outline" size="sm" className="ml-4" onClick={fetchAll}>
          Retry
        </Button>
      </div>
    );
  }

  const nvr = traffic?.newVsReturning;
  const nvrData = nvr
    ? [
        { name: "New", value: nvr.new },
        { name: "Returning", value: nvr.returning },
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Tracking <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">/login</code>
        </p>
        <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Today"         value={dashboard?.today     ?? 0} icon={CalendarDays} color="bg-orange-100 text-orange-600" />
        <StatCard label="Yesterday"     value={dashboard?.yesterday ?? 0} icon={CalendarDays} color="bg-amber-100 text-amber-600" />
        <StatCard label="This Week"     value={dashboard?.thisWeek  ?? 0} icon={TrendingUp}   color="bg-blue-100 text-blue-600" />
        <StatCard label="This Month"    value={dashboard?.thisMonth ?? 0} icon={BarChart2}    color="bg-violet-100 text-violet-600" />
        <StatCard label="Total"         value={dashboard?.total     ?? 0} icon={Users}        color="bg-slate-100 text-slate-600" />
        <StatCard
          label="Online Now"
          value={dashboard?.online ?? 0}
          icon={Wifi}
          color="bg-green-100 text-green-600"
          sub="Active in last 5 min"
        />
        <StatCard label="New Visitors"  value={dashboard?.newVisitors ?? 0} icon={Globe}      color="bg-cyan-100 text-cyan-600" />
        <StatCard label="Returning"     value={dashboard?.returning   ?? 0} icon={Smartphone} color="bg-rose-100 text-rose-600" />
      </div>

      {/* Visitors over time chart */}
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
        {chartData.length === 0 ? (
          <EmptyState text="No data yet" />
        ) : (
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
              <Area type="monotone" dataKey="pageViews" stroke="#FB923C" fill="none"           strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Traffic sources + New vs Returning */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Traffic sources bar chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <SectionTitle>Traffic Sources</SectionTitle>
          {!traffic?.sources.length ? (
            <EmptyState text="No traffic data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={traffic.sources}
                layout="vertical"
                margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
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
          {nvrData.every((d) => d.value === 0) ? (
            <EmptyState text="No data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={nvrData}
                  cx="50%"
                  cy="45%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
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

      {/* WhatsApp Campaigns */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Hash className="w-4 h-4 text-slate-500" />
          <SectionTitle>Campaign Performance</SectionTitle>
        </div>
        {campaigns.length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-400 text-center">
            No campaign data yet. Use <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">?utm_campaign=...</code> links to track campaigns.
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

      {/* Top pages */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-500" />
          <SectionTitle>Top Landing Pages</SectionTitle>
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
                  <th className="text-right px-6 py-3 font-semibold">Visitors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pages.map((p) => (
                  <tr key={p.page} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-slate-700">{p.page}</td>
                    <td className="px-4 py-3 text-right text-slate-800">{p.views.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-800">{p.visitors.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
