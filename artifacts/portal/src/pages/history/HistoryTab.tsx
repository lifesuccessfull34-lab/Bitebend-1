import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type {
  HistoryPage,
  HistoryRevenue,
  HistorySession,
  HistorySessionDetail,
  HistorySessionBill,
} from "@/lib/types";
import {
  Search,
  IndianRupee,
  Receipt,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Send,
  RefreshCw,
  X,
  MessageCircle,
  ExternalLink,
  Camera,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateTime(iso: string) {
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

function rupees(paise: number) {
  return `₹${(paise / 100).toFixed(2)}`;
}

const BILL_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  generated: {
    label: "Generated",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <Receipt className="w-3 h-3" />,
  },
  sent: {
    label: "Sent",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <Send className="w-3 h-3" />,
  },
  awaiting_verification: {
    label: "Awaiting Verification",
    color: "bg-violet-50 text-violet-700 border-violet-200",
    icon: <Camera className="w-3 h-3" />,
  },
  paid: {
    label: "Paid",
    color: "bg-green-50 text-green-700 border-green-200",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-gray-100 text-gray-500 border-gray-200",
    icon: <X className="w-3 h-3" />,
  },
};

const DATE_RANGES = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7days", label: "Last 7 days" },
  { key: "30days", label: "Last 30 days" },
  { key: "custom", label: "Custom" },
] as const;

type DateRangeKey = (typeof DATE_RANGES)[number]["key"];

// ─── Revenue summary strip ────────────────────────────────────────────────────

function RevenueStrip({ revenue }: { revenue: HistoryRevenue | null }) {
  if (!revenue) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {["Today", "This Week", "This Month"].map((label) => (
          <div key={label} className="bg-card rounded-xl border border-border p-4 animate-pulse">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <div className="h-6 bg-muted rounded w-20" />
          </div>
        ))}
      </div>
    );
  }
  const cards = [
    { label: "Today", value: revenue.today },
    { label: "This Week", value: revenue.thisWeek },
    { label: "This Month", value: revenue.thisMonth },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <IndianRupee className="w-3.5 h-3.5 text-green-600" />
            <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
          </div>
          <p className="text-xl font-bold text-green-700">{rupees(c.value)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Paid bills only</p>
        </div>
      ))}
    </div>
  );
}

// ─── Bill status badge ────────────────────────────────────────────────────────

function BillStatusBadge({ status }: { status: string }) {
  const cfg = BILL_STATUS_CONFIG[status] ?? {
    label: status,
    color: "bg-gray-100 text-gray-600 border-gray-200",
    icon: null,
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border",
        cfg.color,
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Audit trail row ──────────────────────────────────────────────────────────

function AuditRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

// ─── Session detail modal ─────────────────────────────────────────────────────

function SessionDetailModal({
  sessionId,
  open,
  onClose,
  onResend,
}: {
  sessionId: number | null;
  open: boolean;
  onClose: () => void;
  onResend: (sessionId: number) => Promise<void>;
}) {
  const [detail, setDetail] = useState<HistorySessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!open || sessionId === null) {
      setDetail(null);
      setScreenshot(null);
      setExpandedOrders(new Set());
      return;
    }
    setLoading(true);
    apiFetch<HistorySessionDetail>(`/owner/history/${sessionId}`)
      .then(setDetail)
      .catch(() => toast.error("Failed to load session details"))
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  const loadScreenshot = useCallback(() => {
    if (!sessionId || screenshot || screenshotLoading) return;
    setScreenshotLoading(true);
    apiFetch<{ screenshotUrl: string }>(`/owner/history/${sessionId}/bill/screenshot`)
      .then((data) => setScreenshot(data.screenshotUrl))
      .catch(() => toast.error("Could not load screenshot"))
      .finally(() => setScreenshotLoading(false));
  }, [sessionId, screenshot, screenshotLoading]);

  const handleResend = async () => {
    if (!sessionId) return;
    setResending(true);
    try {
      await onResend(sessionId);
    } finally {
      setResending(false);
    }
  };

  const bill = detail?.bill ?? null;
  const canResend = bill && (bill.status === "sent" || bill.status === "paid");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-orange-500" />
            Session — Table {detail?.tableNumber ?? "…"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !detail ? (
          <div className="py-10 text-center text-muted-foreground text-sm">Unable to load</div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Session summary */}
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 space-y-1.5 text-xs">
              <AuditRow
                label="Type"
                value={detail.sessionType === "takeaway" ? "Takeaway" : "Dine-in"}
              />
              {detail.sessionType === "dine_in" && detail.tableNumber && (
                <AuditRow label="Table" value={detail.tableNumber} />
              )}
              {detail.sessionType === "takeaway" && detail.customerPhone && (
                <AuditRow label="Phone" value={`+${detail.customerPhone}`} />
              )}
              <AuditRow label="Customer" value={detail.customerName ?? undefined} />
              {detail.sessionType === "dine_in" && (
                <AuditRow label="Phone" value={detail.customerPhone ?? undefined} />
              )}
              <AuditRow label="Opened" value={fmtDateTime(detail.sessionOpenedAt)} />
              <AuditRow
                label="Closed"
                value={detail.sessionClosedAt ? fmtDateTime(detail.sessionClosedAt) : undefined}
              />
              <div className="flex justify-between border-t pt-1.5 mt-0.5">
                <span className="text-muted-foreground font-semibold">{detail.orderCount} orders · {detail.itemCount} items</span>
                <span className="font-bold">{rupees(detail.totalAmount)}</span>
              </div>
            </div>

            {/* Bill section */}
            {bill ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
                  <Receipt className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bill</span>
                  <span className="ml-auto font-mono text-xs font-bold">{bill.billNumber}</span>
                </div>
                <div className="px-3 py-2.5 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <BillStatusBadge status={bill.status} />
                  </div>
                  <AuditRow label="Subtotal" value={rupees(bill.subtotal)} />
                  {bill.tax > 0 && <AuditRow label="Tax" value={rupees(bill.tax)} />}
                  <div className="flex justify-between border-t pt-1.5 mt-0.5">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-base">{rupees(bill.total)}</span>
                  </div>
                </div>

                {/* Audit trail */}
                <div className="px-3 py-2.5 border-t border-border bg-muted/20 space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Audit Trail</p>
                  <AuditRow label="Bill generated" value={fmtDateTime(bill.billGeneratedAt)} />
                  <AuditRow label="Bill sent" value={bill.billSentAt ? fmtDateTime(bill.billSentAt) : null} />
                  <AuditRow
                    label="Screenshot received"
                    value={bill.screenshotReceivedAt ? fmtDateTime(bill.screenshotReceivedAt) : null}
                  />
                  <AuditRow
                    label="Verified"
                    value={bill.verifiedAt ? fmtDateTime(bill.verifiedAt) : null}
                  />
                  {bill.verifiedByName && (
                    <AuditRow label="Verified by" value={bill.verifiedByName} />
                  )}
                  {bill.resentCount > 0 && (
                    <>
                      <AuditRow label="Times resent" value={String(bill.resentCount)} />
                      <AuditRow label="Last resent" value={bill.resentAt ? fmtDateTime(bill.resentAt) : null} />
                    </>
                  )}
                </div>

                {/* Screenshot */}
                {bill.hasScreenshot && (
                  <div className="px-3 py-2.5 border-t border-border">
                    {!screenshot && !screenshotLoading && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-8"
                        onClick={loadScreenshot}
                      >
                        <Camera className="w-3.5 h-3.5 mr-1.5" />
                        View Payment Screenshot
                      </Button>
                    )}
                    {screenshotLoading && (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {screenshot && (
                      <img
                        src={screenshot.startsWith("data:") ? screenshot : `data:image/jpeg;base64,${screenshot}`}
                        alt="Payment screenshot"
                        className="w-full rounded-lg border border-border"
                      />
                    )}
                  </div>
                )}

                {/* Resend action */}
                {canResend && (
                  <div className="px-3 py-2.5 border-t border-border">
                    <Button
                      size="sm"
                      className="w-full text-xs h-8 bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleResend}
                      disabled={resending}
                    >
                      {resending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Resend Bill via WhatsApp
                      {bill.resentCount > 0 && (
                        <span className="ml-1.5 text-[10px] opacity-70">
                          (resent {bill.resentCount}×)
                        </span>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center">
                <p className="text-xs text-muted-foreground">No bill recorded for this session</p>
              </div>
            )}

            {/* Orders */}
            {detail.orders.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Orders ({detail.orders.length})
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {detail.orders.map((order) => {
                    const expanded = expandedOrders.has(order.id);
                    return (
                      <div key={order.id} className="px-3 py-2.5">
                        <button
                          className="w-full flex items-center justify-between gap-2 text-left"
                          onClick={() => setExpandedOrders((prev) => {
                            const next = new Set(prev);
                            if (next.has(order.id)) next.delete(order.id);
                            else next.add(order.id);
                            return next;
                          })}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold">
                              Order #{order.id} · {rupees(order.total)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{order.customerName} · {fmtTime(order.createdAt)}</p>
                          </div>
                          {expanded ? (
                            <ChevronUp className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </button>
                        {expanded && (
                          <div className="mt-2 space-y-1">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">
                                  {item.quantity}× {item.name}
                                  {item.notes && <span className="italic ml-1">({item.notes})</span>}
                                </span>
                                <span className="font-medium">{rupees(item.unitPrice * item.quantity)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Session list card ────────────────────────────────────────────────────────

function SessionCard({
  session,
  onOpen,
}: {
  session: HistorySession;
  onOpen: (id: number) => void;
}) {
  const bill = session.bill;
  return (
    <div
      className="px-4 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => onOpen(session.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            {session.sessionType === "takeaway" ? (
              <span className="font-bold text-sm">Takeaway</span>
            ) : (
              <span className="font-bold text-sm">Table {session.tableNumber}</span>
            )}
            {session.sessionType === "takeaway" && session.customerPhone && (
              <span className="text-xs text-muted-foreground font-mono">+{session.customerPhone}</span>
            )}
            {bill && <BillStatusBadge status={bill.status} />}
            {bill && bill.resentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-1.5 py-0.5">
                <RotateCcw className="w-2.5 h-2.5" />
                {bill.resentCount}×
              </span>
            )}
          </div>
          {(session.customerName || session.customerPhone) && (
            <p className="text-xs text-muted-foreground truncate">
              {session.customerName}
              {session.customerPhone && ` · ${session.customerPhone}`}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {session.orderCount} {session.orderCount === 1 ? "order" : "orders"} · {session.itemCount} items
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="font-bold text-sm">{rupees(session.totalAmount)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(session.sessionClosedAt ?? session.sessionOpenedAt)}</p>
        </div>
      </div>

      {/* Bill audit strip — no extra API call needed, all inline */}
      {bill && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
          {bill.billSentAt && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Send className="w-2.5 h-2.5" />
              Sent {fmtTime(bill.billSentAt)}
            </span>
          )}
          {bill.screenshotReceivedAt && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Camera className="w-2.5 h-2.5" />
              Screenshot {fmtTime(bill.screenshotReceivedAt)}
            </span>
          )}
          {bill.verifiedAt && (
            <span className="text-[10px] text-green-600 flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5" />
              Verified {fmtTime(bill.verifiedAt)}
              {bill.verifiedByName && ` by ${bill.verifiedByName}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main HistoryTab component ────────────────────────────────────────────────

export function HistoryTab() {
  const [revenue, setRevenue] = useState<HistoryRevenue | null>(null);
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildQuery = useCallback(
    (pg: number, q: string, dr: DateRangeKey, from: string, to: string) => {
      const params = new URLSearchParams();
      params.set("page", String(pg));
      params.set("limit", "20");
      if (q.length >= 2) params.set("search", q);
      if (dr !== "all") params.set("dateRange", dr);
      if (dr === "custom" && from) params.set("from", from);
      if (dr === "custom" && to) params.set("to", to);
      return params.toString();
    },
    [],
  );

  const fetchRevenue = useCallback(() => {
    setRevenueLoading(true);
    apiFetch<HistoryRevenue>("/owner/history/revenue")
      .then(setRevenue)
      .catch(() => {})
      .finally(() => setRevenueLoading(false));
  }, []);

  const fetchPage = useCallback(
    async (pg: number, q: string, dr: DateRangeKey, from: string, to: string, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);
      try {
        const data = await apiFetch<HistoryPage>(
          `/owner/history?${buildQuery(pg, q, dr, from, to)}`,
        );
        setPage(data);
        if (append) {
          setSessions((prev) => [...prev, ...data.sessions]);
        } else {
          setSessions(data.sessions);
        }
      } catch {
        toast.error("Failed to load session history");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildQuery],
  );

  useEffect(() => {
    fetchRevenue();
    fetchPage(1, search, dateRange, customFrom, customTo);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = useCallback(
    (q: string, dr: DateRangeKey, from: string, to: string) => {
      setCurrentPage(1);
      fetchPage(1, q, dr, from, to, false);
    },
    [fetchPage],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
      if (value.length === 0 || value.length >= 2) {
        searchDebounce.current = setTimeout(() => {
          applyFilters(value, dateRange, customFrom, customTo);
        }, 400);
      }
    },
    [applyFilters, dateRange, customFrom, customTo],
  );

  const handleDateRangeChange = useCallback(
    (dr: DateRangeKey) => {
      setDateRange(dr);
      if (dr !== "custom") {
        applyFilters(search, dr, customFrom, customTo);
      }
    },
    [applyFilters, search, customFrom, customTo],
  );

  const handleCustomApply = useCallback(() => {
    applyFilters(search, "custom", customFrom, customTo);
  }, [applyFilters, search, customFrom, customTo]);

  const handleLoadMore = useCallback(() => {
    const next = currentPage + 1;
    setCurrentPage(next);
    fetchPage(next, search, dateRange, customFrom, customTo, true);
  }, [currentPage, fetchPage, search, dateRange, customFrom, customTo]);

  const handleResend = useCallback(async (sessionId: number) => {
    try {
      type ResendResult = {
        ok: boolean;
        deliveryMethod: "bridge" | "deeplink";
        sent: boolean;
        whatsappUrl: string | null;
        resentCount: number;
        customerPhone: string;
        billNumber: string;
      };
      const result = await apiFetch<ResendResult>(
        `/owner/history/${sessionId}/bill/resend`,
        { method: "POST" },
      );
      if (result.sent) {
        toast.success(`Bill resent via WhatsApp (${result.resentCount}× total)`);
      } else if (result.whatsappUrl) {
        window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
        toast.success("WhatsApp opened — tap Send to deliver the bill");
      }
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId || !s.bill) return s;
          const now = new Date().toISOString();
          const updated: HistorySessionBill = {
            ...s.bill,
            resentCount: result.resentCount,
            resentAt: now,
          };
          return { ...s, bill: updated };
        }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend bill";
      toast.error(msg);
    }
  }, []);

  const hasMore = page ? currentPage < page.totalPages : false;

  return (
    <div className="space-y-4">
      {/* Revenue summary */}
      <RevenueStrip revenue={revenueLoading ? null : revenue} />

      {/* Search + date filters */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search bill no., customer name or phone, table…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
              onClick={() => handleSearchChange("")}
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DATE_RANGES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleDateRangeChange(key)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full font-medium transition-all whitespace-nowrap border",
                dateRange === key
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {dateRange === "custom" && (
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="date"
              className="h-8 text-xs flex-1 min-w-[130px]"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              className="h-8 text-xs flex-1 min-w-[130px]"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
            <Button
              size="sm"
              className="h-8 text-xs bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleCustomApply}
              disabled={!customFrom || !customTo}
            >
              Apply
            </Button>
          </div>
        )}
      </div>

      {/* Session list */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Closed Sessions</h2>
          {page && (
            <span className="ml-auto text-xs text-muted-foreground">
              {page.total} {page.total === 1 ? "session" : "sessions"}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertCircle className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-medium">No closed sessions</p>
            <p className="text-sm mt-1">
              {search
                ? "Try adjusting your search or date filter"
                : "Sessions appear here once they are closed and paid"}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onOpen={(id) => {
                    setSelectedSessionId(id);
                    setDetailOpen(true);
                  }}
                />
              ))}
            </div>

            {hasMore && (
              <div className="px-4 py-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-8"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Session detail modal */}
      <SessionDetailModal
        sessionId={selectedSessionId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onResend={handleResend}
      />
    </div>
  );
}
