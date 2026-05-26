import { useState, useEffect, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiFetch } from "@/lib/api";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Users, TrendingUp, IndianRupee, UserCheck, UserMinus,
  RefreshCw, BarChart3, ShoppingBag, Repeat2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Summary {
  totalCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  avgSpend: number;
  newLast7Days: number;
  inactiveCount: number;
}
interface Segment { label: string; key: string; count: number; revenue: number }
interface GrowthPoint { date: string; newCustomers: number }
interface SpendBucket { label: string; count: number }
interface RepeatBehavior { avgOrdersPerCustomer: number; repeatRate: number; avgDaysBetween: number }
interface CustomerRow { phone: string; name: string; totalOrders: number; totalSpent: number; lastOrderAt: string }

interface Analytics {
  summary: Summary;
  segments: Segment[];
  growth: GrowthPoint[];
  spending: SpendBucket[];
  repeatBehavior: RepeatBehavior;
  topCustomers: CustomerRow[];
  inactiveList: CustomerRow[];
}

const DATE_RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: 0 },
];

const ORDER_TYPES = [
  { label: "All Types", value: "all" },
  { label: "Dine-in", value: "dine-in" },
  { label: "Takeaway", value: "takeaway" },
];

const SEGMENT_COLORS: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  repeat: "bg-violet-50 text-violet-700 border-violet-200",
  loyal: "bg-orange-50 text-orange-700 border-orange-200",
  highValue: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const SEGMENT_ICONS: Record<string, React.ElementType> = {
  new: Users,
  repeat: Repeat2,
  loyal: Repeat2,
  highValue: IndianRupee,
};

function StatCard({
  label, value, sub, icon: Icon, color,
}: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex gap-4 items-start">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-orange-500" />
      <h2 className="font-semibold text-slate-700">{title}</h2>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}


export default function CustomerAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);
  const [orderType, setOrderType] = useState("all");

  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (rangeDays > 0) {
      const start = new Date(Date.now() - rangeDays * 86400000);
      params.set("startDate", start.toISOString().slice(0, 10));
    }
    if (orderType !== "all") params.set("orderType", orderType);
    apiFetch<Analytics>(`/owner/customers/analytics?${params}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [rangeDays, orderType]);

  const growthFilled = useMemo(() => {
    if (!data?.growth.length) return [];
    const map = new Map(data.growth.map((g) => [g.date, g.newCustomers]));
    const days = rangeDays > 0 ? rangeDays : 30;
    const result: GrowthPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      result.push({ date: d.slice(5), newCustomers: map.get(d) ?? 0 });
    }
    return result;
  }, [data?.growth, rangeDays]);

  const { summary, segments, spending, repeatBehavior } = data ?? {
    summary: { totalCustomers: 0, repeatCustomers: 0, repeatRate: 0, avgSpend: 0, newLast7Days: 0, inactiveCount: 0 },
    segments: [], spending: [],
    repeatBehavior: { avgOrdersPerCustomer: 0, repeatRate: 0, avgDaysBetween: 0 },
  };

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-orange-500" />
              Customer Intelligence
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">Understand who your customers are and how they order</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value))}
            >
              {DATE_RANGES.map((r) => (
                <option key={r.days} value={r.days}>{r.label}</option>
              ))}
            </select>
            <select
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
            >
              {ORDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button
              onClick={fetchData}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition flex items-center gap-1.5 text-sm"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Loading analytics…
          </div>
        ) : (
          <>
            {/* ── Summary metrics ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              <StatCard label="Total Customers" value={summary.totalCustomers} icon={Users} color="bg-blue-100 text-blue-600" />
              <StatCard label="Repeat Customers" value={`${summary.repeatCustomers}`} sub={`${summary.repeatRate}% of total`} icon={Repeat2} color="bg-violet-100 text-violet-600" />
              <StatCard label="Avg Spend" value={`₹${summary.avgSpend.toLocaleString("en-IN")}`} sub="per customer" icon={IndianRupee} color="bg-emerald-100 text-emerald-600" />
              <StatCard label="New (last 7 days)" value={summary.newLast7Days} icon={UserCheck} color="bg-orange-100 text-orange-600" />
              <StatCard label="Inactive" value={summary.inactiveCount} sub="no orders in 7 days" icon={UserMinus} color="bg-red-100 text-red-600" />
            </div>

            {/* ── Growth chart + Spending distribution ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <SectionTitle icon={TrendingUp} title="Customer Growth" sub="new customers per day" />
                {growthFilled.length === 0 ? (
                  <div className="text-center py-12 text-slate-300 text-sm">No data for this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={growthFilled}>
                      <defs>
                        <linearGradient id="custGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                        formatter={(v: number) => [v, "New Customers"]}
                      />
                      <Area type="monotone" dataKey="newCustomers" stroke="#f97316" fill="url(#custGrad)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <SectionTitle icon={BarChart3} title="Spending Distribution" />
                {spending.length === 0 ? (
                  <div className="text-center py-12 text-slate-300 text-sm">No data for this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={spending} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                        formatter={(v: number) => [v, "Customers"]}
                      />
                      <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── Segments ── */}
            <div>
              <SectionTitle icon={Users} title="Customer Segments" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {segments.map((seg) => {
                  const Icon = SEGMENT_ICONS[seg.key] ?? Users;
                  return (
                    <div key={seg.key} className={cn("border rounded-xl p-4 space-y-2", SEGMENT_COLORS[seg.key] ?? "bg-slate-50 text-slate-700 border-slate-200")}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <span className="text-xs font-semibold uppercase tracking-wide">{seg.label}</span>
                      </div>
                      <p className="text-3xl font-bold">{seg.count}</p>
                      <p className="text-xs opacity-70">₹{seg.revenue.toLocaleString("en-IN")} revenue</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                New = 1 order · Repeat = 2–5 orders · Loyal = 5+ orders · High Value = ₹2,000+ spent
              </p>
            </div>

            {/* ── Repeat behavior ── */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <SectionTitle icon={Repeat2} title="Repeat Behaviour" />
              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-3xl font-bold text-slate-800">{repeatBehavior.avgOrdersPerCustomer}</p>
                  <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                    <ShoppingBag className="w-3.5 h-3.5" /> Avg orders / customer
                  </p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-800">{repeatBehavior.repeatRate}%</p>
                  <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                    <Repeat2 className="w-3.5 h-3.5" /> Repeat rate
                  </p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-800">{repeatBehavior.avgDaysBetween}</p>
                  <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Avg days between orders
                  </p>
                </div>
              </div>
            </div>

          </>
        )}
      </div>
    </AppShell>
  );
}
