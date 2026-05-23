import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { AdminShell, ADMIN_NAV_ITEMS } from "@/components/layout/AdminShell";
import type { AdminSection } from "@/components/layout/AdminShell";
import { apiFetch, ApiError } from "@/lib/api";
import type {
  RestaurantWithOwner, AdminStats, AdminCustomer,
  SubscriptionPlan, SubscriptionTransaction, Notification, Order,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Store, TrendingUp, ShoppingBag, IndianRupee,
  ToggleLeft, ToggleRight, Trash2, Users, CreditCard,
  Phone, AlertCircle, Bell, Plus, Edit2, Save,
  X, CheckCircle, Ban, RefreshCw, Send, BarChart3,
  LayoutDashboard, TrendingDown, KeyRound, Copy, Eye, EyeOff,
  Filter, ChevronDown, Smartphone, ShieldCheck, Pencil, Clock,
  FileText, ScrollText, ExternalLink, Download, FileSpreadsheet,
  Receipt, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STATE_NAMES, getDistricts } from "@/data/india-states-districts";
import * as XLSX from "xlsx";

const STATUS_SUB_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  exhausted: "bg-red-100 text-red-600",
  suspended: "bg-slate-100 text-slate-500",
  expired: "bg-red-100 text-red-600",
};

function StatCard({ label, value, icon: Icon, color, sub, accent }: {
  label: string; value: string | number; icon: React.ElementType;
  color: string; sub?: string; accent?: string;
}) {
  return (
    <div className={cn("bg-white rounded-xl border p-5 shadow-sm", accent ?? "border-slate-200")}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", color)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

interface PlanForm {
  name: string; price: string; customerLimit: string; isUnlimited: boolean;
  description: string; displayOrder: string;
  validityType: "days" | "months"; validityValue: string;
}
const emptyPlanForm = (): PlanForm => ({ name: "", price: "", customerLimit: "", isUnlimited: false, description: "", displayOrder: "0", validityType: "days", validityValue: "30" });

interface PlanFormPanelProps {
  editingPlan: SubscriptionPlan | null;
  planForm: PlanForm;
  planSaving: boolean;
  onChangePlanForm: React.Dispatch<React.SetStateAction<PlanForm>>;
  onSave: () => void;
  onCancel: () => void;
}

function PlanFormPanel({ editingPlan, planForm, planSaving, onChangePlanForm, onSave, onCancel }: PlanFormPanelProps) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-sm text-slate-700">{editingPlan ? `Edit: ${editingPlan.name}` : "New Plan"}</h3>

      {/* Row 1 — Plan Name (full width) */}
      <div className="space-y-1">
        <Label className="text-xs">Plan Name</Label>
        <Input placeholder="e.g. Starter" value={planForm.name} onChange={(e) => onChangePlanForm((f) => ({ ...f, name: e.target.value }))} />
      </div>

      {/* Row 2 — Price | Validity Type | Duration (3 equal columns) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Price (₹)</Label>
          <Input type="number" placeholder="199" value={planForm.price} onChange={(e) => onChangePlanForm((f) => ({ ...f, price: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Validity Type</Label>
          <select
            value={planForm.validityType}
            onChange={(e) => onChangePlanForm((f) => ({ ...f, validityType: e.target.value as "days" | "months" }))}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="days">Days</option>
            <option value="months">Months</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Duration ({planForm.validityType === "months" ? "months" : "days"})</Label>
          <Input
            type="number"
            min="1"
            placeholder={planForm.validityType === "months" ? "e.g. 6" : "e.g. 30"}
            value={planForm.validityValue}
            onChange={(e) => onChangePlanForm((f) => ({ ...f, validityValue: e.target.value }))}
          />
        </div>
      </div>

      {/* Row 3 — Customer Limit (full width) with Unlimited toggle beside input */}
      <div className="space-y-1">
        <Label className="text-xs">Customer Limit</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="1"
            placeholder="e.g. 2000"
            value={planForm.isUnlimited ? "" : planForm.customerLimit}
            disabled={planForm.isUnlimited}
            onChange={(e) => onChangePlanForm((f) => ({ ...f, customerLimit: e.target.value }))}
            className={planForm.isUnlimited ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}
          />
          <button
            type="button"
            onClick={() => onChangePlanForm((f) => ({ ...f, isUnlimited: !f.isUnlimited, customerLimit: "" }))}
            className={cn(
              "flex-shrink-0 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition-colors whitespace-nowrap",
              planForm.isUnlimited
                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
            )}
          >
            <span className={cn(
              "w-8 h-4 rounded-full relative flex-shrink-0 transition-colors",
              planForm.isUnlimited ? "bg-indigo-500" : "bg-slate-300"
            )}>
              <span className={cn(
                "absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform",
                planForm.isUnlimited ? "translate-x-4" : "translate-x-0.5"
              )} />
            </span>
            {planForm.isUnlimited ? "∞ Unlimited" : "Unlimited"}
          </button>
        </div>
      </div>

      {/* Row 4 — Description | Display Order (3:1 ratio) */}
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-3 space-y-1">
          <Label className="text-xs">Description (optional)</Label>
          <Input placeholder="Perfect for small restaurants" value={planForm.description} onChange={(e) => onChangePlanForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Display Order</Label>
          <Input type="number" value={planForm.displayOrder} onChange={(e) => onChangePlanForm((f) => ({ ...f, displayOrder: e.target.value }))} />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1" /> Cancel
        </Button>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={planSaving || !planForm.name || !planForm.price} onClick={onSave}>
          {planSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
          Save Plan
        </Button>
      </div>
    </div>
  );
}

export default function Admin() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<AdminSection>("overview");
  const [overviewRestTab, setOverviewRestTab] = useState<"active" | "suspended" | "exhausted" | "disabled">("active");
  const [restaurants, setRestaurants] = useState<RestaurantWithOwner[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);

  interface BillStats {
    total: number;
    active: number;
    expired: number;
    opened: number;
    openRate: number;
    last24h: { generated: number; opened: number };
  }
  const [billStats, setBillStats] = useState<BillStats | null>(null);

  interface AdminResource {
    id: number; title: string; description: string | null; type: string;
    category: string | null; thumbnail: string | null; url: string | null;
    fileUrl: string | null; tags: string[]; featured: boolean;
    displayOrder: number; status: string; approvalStatus: string;
    visibleTo: string; createdBy: number | null; approvedBy: number | null;
    publishAt: string | null; expireAt: string | null;
    duration: string | null; videoSource: string | null; sizeLabel: string | null;
    planName: string | null; planPrice: string | null; planPeriod: string | null;
    planFeatures: string[] | null; planHighlight: boolean | null;
    planBadge: string | null; planCta: string | null;
    iconName: string | null; iconColor: string | null;
    question: string | null; answer: string | null;
    createdAt: string; updatedAt: string;
  }
  interface AdminResourceFormState {
    id: number | null; title: string; description: string; type: string;
    category: string; url: string; fileUrl: string; tags: string;
    featured: boolean; displayOrder: number; status: string; approvalStatus: string;
    duration: string; videoSource: string; sizeLabel: string;
    planName: string; planPrice: string; planPeriod: string;
    planFeatures: string; planHighlight: boolean; planBadge: string; planCta: string;
    iconName: string; iconColor: string; question: string; answer: string;
  }
  const emptyResForm = (): AdminResourceFormState => ({
    id: null, title: "", description: "", type: "video", category: "",
    url: "", fileUrl: "", tags: "", featured: false, displayOrder: 0,
    status: "draft", approvalStatus: "pending",
    duration: "", videoSource: "youtube", sizeLabel: "",
    planName: "", planPrice: "", planPeriod: "", planFeatures: "",
    planHighlight: false, planBadge: "", planCta: "",
    iconName: "", iconColor: "", question: "", answer: "",
  });
  const resourceToForm = (r: AdminResource): AdminResourceFormState => ({
    id: r.id, title: r.title, description: r.description ?? "",
    type: r.type, category: r.category ?? "", url: r.url ?? "",
    fileUrl: r.fileUrl ?? "", tags: (r.tags ?? []).join(", "),
    featured: r.featured, displayOrder: r.displayOrder, status: r.status,
    approvalStatus: r.approvalStatus,
    duration: r.duration ?? "", videoSource: r.videoSource ?? "youtube",
    sizeLabel: r.sizeLabel ?? "", planName: r.planName ?? "",
    planPrice: r.planPrice ?? "", planPeriod: r.planPeriod ?? "",
    planFeatures: (r.planFeatures ?? []).join("\n"),
    planHighlight: r.planHighlight ?? false, planBadge: r.planBadge ?? "",
    planCta: r.planCta ?? "", iconName: r.iconName ?? "",
    iconColor: r.iconColor ?? "", question: r.question ?? "", answer: r.answer ?? "",
  });
  const [adminResources, setAdminResources] = useState<AdminResource[]>([]);
  const [resFilter, setResFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [resForm, setResForm] = useState<AdminResourceFormState | null>(null);
  const [resSaving, setResSaving] = useState(false);
  const [resActionId, setResActionId] = useState<number | null>(null);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [transactions, setTransactions] = useState<(SubscriptionTransaction & { restaurantName?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);

  const handleAuthError = useCallback((e: unknown) => {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      // Destroy the server session first so that any stale owner/other-role
      // session cookie is cleared.  Without this, after the hard redirect the
      // AdminPublicRoute would see a non-super_admin user and bounce to
      // /restaurant/dashboard instead of showing the admin login form.
      fetch("/api/auth/logout", { method: "POST", credentials: "include" })
        .catch(() => {})
        .finally(() => { window.location.href = "/portal/admin/login"; });
      return true;
    }
    return false;
  }, []); // stable — no dependencies needed

  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlanForm());
  const [planSaving, setPlanSaving] = useState(false);

  const [suspendTarget, setSuspendTarget] = useState<RestaurantWithOwner | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const [credModal, setCredModal] = useState<{
    restaurantId: number; restaurantName: string;
    email: string; password: string | null;
  } | null>(null);
  const [credResetting, setCredResetting] = useState(false);
  const [credCopied, setCredCopied] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<number | null>(null);
  const [showModalPassword, setShowModalPassword] = useState(false);

  const [notifTargetState, setNotifTargetState] = useState<string>("");
  const [notifTargetDistrict, setNotifTargetDistrict] = useState<string>("");
  const [notifTargetCity, setNotifTargetCity] = useState<string>("");
  const [notifTargetRestaurantId, setNotifTargetRestaurantId] = useState<string>("");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifType, setNotifType] = useState<"info" | "warning" | "success" | "error">("info");
  const [notifSending, setNotifSending] = useState(false);
  const [notifSent, setNotifSent] = useState(false);
  const [notifSentCount, setNotifSentCount] = useState(0);

  const [filterState, setFilterState] = useState<string>("all");
  const [filterDistrict, setFilterDistrict] = useState<string>("all");

  const [txnFilterOpen, setTxnFilterOpen] = useState(false);
  const [txnFilterState, setTxnFilterState] = useState("all");
  const [txnFilterDistrict, setTxnFilterDistrict] = useState("all");
  const [txnFilterName, setTxnFilterName] = useState("");

  const [custFilterState, setCustFilterState] = useState("all");
  const [custFilterDistrict, setCustFilterDistrict] = useState("all");
  const [custFilterCity, setCustFilterCity] = useState("all");
  const [custSearch, setCustSearch] = useState("");
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingXLSX, setExportingXLSX] = useState(false);
  const [exportingRestCSV, setExportingRestCSV] = useState(false);
  const [exportingRestXLSX, setExportingRestXLSX] = useState(false);

  interface PaymentSettings {
    upiId: string;
    razorpayConfigured: boolean;
    razorpayKeyId: string | null;
    pendingCount: number;
    pendingAmount: number;
    collectedAmount: number;
  }
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [upiIdEdit, setUpiIdEdit] = useState("");
  const [editingUpi, setEditingUpi] = useState(false);
  const [upiSaving, setUpiSaving] = useState(false);
  const [editingRazorpay, setEditingRazorpay] = useState(false);
  const [rzpKeyId, setRzpKeyId] = useState("");
  const [rzpKeySecret, setRzpKeySecret] = useState("");
  const [rzpSaving, setRzpSaving] = useState(false);
  const [rzpShowSecret, setRzpShowSecret] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [rests, s, custs, plns, txns, ps, bs, rs] = await Promise.all([
        apiFetch<RestaurantWithOwner[]>("/admin/restaurants"),
        apiFetch<AdminStats>("/admin/stats"),
        apiFetch<AdminCustomer[]>("/admin/customers"),
        apiFetch<SubscriptionPlan[]>("/admin/plans"),
        apiFetch<(SubscriptionTransaction & { restaurantName?: string })[]>("/admin/transactions"),
        apiFetch<PaymentSettings>("/admin/payment-settings"),
        apiFetch<BillStats>("/admin/bill-stats"),
        apiFetch<AdminResource[]>("/admin/resources"),
      ]);
      setRestaurants(rests);
      setStats(s);
      setCustomers(custs);
      setPlans(plns);
      setTransactions(txns);
      setPaymentSettings(ps);
      setUpiIdEdit(ps.upiId);
      setBillStats(bs);
      setAdminResources(rs);
    } catch (e) {
      handleAuthError(e);
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (id: number) => {
    setActionId(id); setActionError(null);
    try { await apiFetch(`/admin/restaurants/${id}/toggle`, { method: "POST" }); await fetchData(); }
    catch (e) { if (!handleAuthError(e)) setActionError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    setActionId(suspendTarget.id); setActionError(null);
    try {
      await apiFetch(`/admin/restaurants/${suspendTarget.id}/suspend`, {
        method: "POST", body: JSON.stringify({ reason: suspendReason }),
      });
      setSuspendTarget(null); setSuspendReason("");
      await fetchData();
    } catch (e) { if (!handleAuthError(e)) setActionError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleActivate = async (id: number) => {
    setActionId(id); setActionError(null);
    try { await apiFetch(`/admin/restaurants/${id}/activate`, { method: "POST" }); await fetchData(); }
    catch (e) { if (!handleAuthError(e)) setActionError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}" and all its data? This cannot be undone.`)) return;
    setActionError(null);
    try { await apiFetch(`/admin/restaurants/${id}`, { method: "DELETE" }); await fetchData(); }
    catch (e) { if (!handleAuthError(e)) setActionError((e as Error).message); }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setActionId(deleteTarget.id); setActionError(null);
    try {
      await apiFetch(`/admin/restaurants/${deleteTarget.id}`, { method: "DELETE" });
      await fetchData();
      setDeleteTarget(null);
    } catch (e) {
      if (!handleAuthError(e)) setActionError((e as Error).message);
    } finally {
      setActionId(null);
    }
  };

  const handleMarkPaid = async (txnId: number) => {
    setActionId(txnId); setActionError(null);
    try { await apiFetch(`/admin/transactions/${txnId}/mark-paid`, { method: "POST" }); await fetchData(); }
    catch (e) { if (!handleAuthError(e)) setActionError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleRejectTxn = async (txnId: number) => {
    if (!confirm("Reject this UPI payment? The restaurant will be notified that their UTR could not be verified.")) return;
    setActionId(txnId); setActionError(null);
    try { await apiFetch(`/admin/transactions/${txnId}/reject`, { method: "POST" }); await fetchData(); }
    catch (e) { if (!handleAuthError(e)) setActionError((e as Error).message); }
    finally { setActionId(null); }
  };

  const handleSaveUpiId = async () => {
    if (!upiIdEdit.trim()) return;
    setUpiSaving(true); setActionError(null);
    try {
      await apiFetch("/admin/payment-settings", { method: "PUT", body: JSON.stringify({ upiId: upiIdEdit.trim() }) });
      setPaymentSettings((ps) => ps ? { ...ps, upiId: upiIdEdit.trim() } : ps);
      setEditingUpi(false);
    } catch (e) { if (!handleAuthError(e)) setActionError((e as Error).message); }
    finally { setUpiSaving(false); }
  };

  const openCredModal = (r: RestaurantWithOwner) => {
    setCredModal({ restaurantId: r.id, restaurantName: r.name, email: r.ownerEmail ?? "", password: null });
    setShowModalPassword(false);
    setCredCopied(null);
  };

  const handleResetPassword = async () => {
    if (!credModal) return;
    setCredResetting(true); setActionError(null);
    try {
      const data = await apiFetch<{ email: string; password: string }>(
        `/admin/restaurants/${credModal.restaurantId}/reset-password`, { method: "POST" }
      );
      setCredModal((m) => m ? { ...m, email: data.email, password: data.password } : null);
      setShowModalPassword(false);
      await fetchData();
    } catch (e) { setActionError((e as Error).message); }
    finally { setCredResetting(false); }
  };

  const copyCredField = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCredCopied(key);
    setTimeout(() => setCredCopied(null), 2000);
  };

  const openEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    const unlimited = plan.customerLimit >= 999999;
    setPlanForm({
      name: plan.name,
      price: String(plan.price / 100),
      customerLimit: unlimited ? "" : String(plan.customerLimit),
      isUnlimited: unlimited,
      description: plan.description ?? "",
      displayOrder: String(plan.displayOrder),
      validityType: plan.validityType ?? "days",
      validityValue: String(plan.validityValue ?? 30),
    });
  };

  const handleSavePlan = async () => {
    setPlanSaving(true);
    const body = {
      name: planForm.name,
      price: Math.round(parseFloat(planForm.price) * 100),
      customerLimit: planForm.isUnlimited ? 999999 : parseInt(planForm.customerLimit),
      description: planForm.description || null,
      displayOrder: parseInt(planForm.displayOrder) || 0,
      isActive: true,
      validityType: planForm.validityType,
      validityValue: parseInt(planForm.validityValue) || 30,
    };
    setActionError(null);
    try {
      if (editingPlan) {
        await apiFetch(`/admin/plans/${editingPlan.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/admin/plans", { method: "POST", body: JSON.stringify(body) });
      }
      setEditingPlan(null); setNewPlanOpen(false); setPlanForm(emptyPlanForm());
      await fetchData();
    } catch (e) { setActionError((e as Error).message); }
    finally { setPlanSaving(false); }
  };

  const handleDeletePlan = async (id: number) => {
    if (!confirm("Delete this plan? Existing subscribers are unaffected.")) return;
    setActionError(null);
    try { await apiFetch(`/admin/plans/${id}`, { method: "DELETE" }); await fetchData(); }
    catch (e) { setActionError((e as Error).message); }
  };

  const handleSendNotif = async () => {
    if (!notifTitle || !notifMessage || notifTargetRestaurants.length === 0) return;
    setNotifSending(true); setActionError(null);
    try {
      const ids = notifTargetRestaurants.map((r) => r.id);
      const sentCount = ids.length;
      await apiFetch("/admin/notifications", {
        method: "POST",
        body: JSON.stringify({ restaurantIds: ids, title: notifTitle, message: notifMessage, type: notifType }),
      });
      setNotifSentCount(sentCount);
      setNotifTitle(""); setNotifMessage("");
      setNotifTargetState(""); setNotifTargetDistrict(""); setNotifTargetCity(""); setNotifTargetRestaurantId("");
      setNotifSent(true);
      setTimeout(() => setNotifSent(false), 3000);
    } catch (e) { setActionError((e as Error).message); }
    finally { setNotifSending(false); }
  };

  const handleSaveResource = useCallback(async () => {
    if (!resForm) return;
    setResSaving(true);
    try {
      const body = {
        title: resForm.title.trim(), description: resForm.description.trim() || null,
        type: resForm.type, category: resForm.category.trim() || null,
        url: resForm.url.trim() || null, fileUrl: resForm.fileUrl.trim() || null,
        tags: resForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
        featured: resForm.featured, displayOrder: resForm.displayOrder,
        status: resForm.status, approvalStatus: resForm.approvalStatus,
        duration: resForm.duration.trim() || null,
        videoSource: resForm.videoSource || null,
        sizeLabel: resForm.sizeLabel.trim() || null,
        planName: resForm.planName.trim() || null,
        planPrice: resForm.planPrice.trim() || null,
        planPeriod: resForm.planPeriod.trim() || null,
        planFeatures: resForm.planFeatures.split("\n").map((f) => f.trim()).filter(Boolean),
        planHighlight: resForm.planHighlight,
        planBadge: resForm.planBadge.trim() || null,
        planCta: resForm.planCta || null,
        iconName: resForm.iconName.trim() || null,
        iconColor: resForm.iconColor.trim() || null,
        question: resForm.question.trim() || null,
        answer: resForm.answer.trim() || null,
      };
      if (resForm.id) {
        const updated = await apiFetch<AdminResource>(`/admin/resources/${resForm.id}`, { method: "PUT", body: JSON.stringify(body) });
        setAdminResources((prev) => prev.map((r) => r.id === resForm.id ? updated : r));
      } else {
        const created = await apiFetch<AdminResource>("/admin/resources", { method: "POST", body: JSON.stringify(body) });
        setAdminResources((prev) => [...prev, created]);
      }
      setResForm(null);
    } catch (e) { handleAuthError(e); }
    finally { setResSaving(false); }
  }, [resForm, handleAuthError]);

  const handleResApprove = useCallback(async (id: number) => {
    setResActionId(id);
    try {
      const updated = await apiFetch<AdminResource>(`/admin/resources/${id}/approve`, { method: "POST" });
      setAdminResources((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) { handleAuthError(e); }
    finally { setResActionId(null); }
  }, [handleAuthError]);

  const handleResReject = useCallback(async (id: number) => {
    setResActionId(id);
    try {
      const updated = await apiFetch<AdminResource>(`/admin/resources/${id}/reject`, { method: "POST" });
      setAdminResources((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) { handleAuthError(e); }
    finally { setResActionId(null); }
  }, [handleAuthError]);

  const handleResFeature = useCallback(async (id: number) => {
    setResActionId(id);
    try {
      const updated = await apiFetch<AdminResource>(`/admin/resources/${id}/feature`, { method: "POST" });
      setAdminResources((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) { handleAuthError(e); }
    finally { setResActionId(null); }
  }, [handleAuthError]);

  const handleResDelete = useCallback(async (id: number) => {
    if (!confirm("Delete this resource? This cannot be undone.")) return;
    setResActionId(id);
    try {
      await apiFetch(`/admin/resources/${id}`, { method: "DELETE" });
      setAdminResources((prev) => prev.filter((r) => r.id !== id));
    } catch (e) { handleAuthError(e); }
    finally { setResActionId(null); }
  }, [handleAuthError]);

  const availableDistricts = useMemo(
    () => (filterState === "all" ? [] : getDistricts(filterState)),
    [filterState]
  );

  const filteredRestaurants = useMemo(() => {
    return restaurants.filter((r) => {
      if (r.subscriptionStatus !== "active") return false;
      if (filterState !== "all" && r.state !== filterState) return false;
      if (filterDistrict !== "all" && r.district !== filterDistrict) return false;
      return true;
    });
  }, [restaurants, filterState, filterDistrict]);

  const suspendedRests = useMemo(() => restaurants.filter((r) => r.subscriptionStatus === "suspended"), [restaurants]);
  const exhaustedRestsArr = useMemo(() => restaurants.filter((r) => r.subscriptionStatus === "exhausted"), [restaurants]);
  const activeRestsArr = useMemo(() => restaurants.filter((r) => r.subscriptionStatus === "active"), [restaurants]);
  const disabledRestsArr = useMemo(() => restaurants.filter((r) => !r.isActive), [restaurants]);
  const filteredResources = useMemo(() =>
    resFilter === "all" ? adminResources
      : adminResources.filter((r) => r.approvalStatus === resFilter),
    [adminResources, resFilter],
  );

  const txnStates = useMemo(() =>
    [...new Set(transactions.map((t) => t.restaurantState).filter(Boolean) as string[])].sort(),
    [transactions]);

  const custStates = useMemo(() =>
    [...new Set(customers.map((c) => c.state).filter(Boolean) as string[])].sort(),
    [customers]);

  const custDistricts = useMemo(() =>
    custFilterState === "all"
      ? []
      : [...new Set(customers.filter((c) => c.state === custFilterState).map((c) => c.district).filter(Boolean) as string[])].sort(),
    [customers, custFilterState]);

  const custCities = useMemo(() =>
    custFilterDistrict === "all"
      ? [...new Set(customers.filter((c) => custFilterState === "all" || c.state === custFilterState).map((c) => c.city).filter(Boolean) as string[])].sort()
      : [...new Set(customers.filter((c) => c.district === custFilterDistrict).map((c) => c.city).filter(Boolean) as string[])].sort(),
    [customers, custFilterState, custFilterDistrict]);

  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (custFilterState !== "all") list = list.filter((c) => c.state === custFilterState);
    if (custFilterDistrict !== "all") list = list.filter((c) => c.district === custFilterDistrict);
    if (custFilterCity !== "all") list = list.filter((c) => c.city === custFilterCity);
    if (custSearch.trim()) {
      const q = custSearch.trim().toLowerCase();
      list = list.filter((c) => c.customerPhone.includes(q) || c.customerName.toLowerCase().includes(q));
    }
    return list;
  }, [customers, custFilterState, custFilterDistrict, custFilterCity, custSearch]);

  const buildExportFilename = (ext: string) => {
    const datePart = new Date().toISOString().slice(0, 10);
    const locPart =
      custFilterCity !== "all"
        ? `-${custFilterCity.toLowerCase().replace(/\s+/g, "-")}`
        : custFilterState !== "all"
        ? `-${custFilterState.toLowerCase().replace(/\s+/g, "-")}`
        : "";
    return `customers${locPart}-${datePart}.${ext}`;
  };

  const buildExportRows = () =>
    filteredCustomers.map((c) => ({
      "Customer Name": c.customerName,
      "Phone Number": c.customerPhone,
      "City": c.city ?? "",
      "State": c.state ?? "",
      "Total Orders": c.totalOrders,
      "Total Spent (₹)": (c.totalSpent / 100).toFixed(2),
      "Last Order Date": new Date(c.lastOrderAt).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
      }),
      "Restaurants": c.restaurants.join("; "),
    }));

  const handleExportCSV = () => {
    setExportingCSV(true);
    try {
      const rows = buildExportRows();
      if (rows.length === 0) return;
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(","),
        ...rows.map((r) =>
          Object.values(r)
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildExportFilename("csv");
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingCSV(false);
    }
  };

  const handleExportXLSX = () => {
    setExportingXLSX(true);
    try {
      const rows = buildExportRows();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
        { wch: 13 }, { wch: 16 }, { wch: 18 }, { wch: 36 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customers");
      XLSX.writeFile(wb, buildExportFilename("xlsx"));
    } finally {
      setExportingXLSX(false);
    }
  };

  const txnDistricts = useMemo(() =>
    [...new Set(transactions
      .filter((t) => txnFilterState === "all" || t.restaurantState === txnFilterState)
      .map((t) => t.restaurantDistrict).filter(Boolean) as string[])].sort(),
    [transactions, txnFilterState]);

  const filteredTransactions = useMemo(() => {
    const name = txnFilterName.trim().toLowerCase();
    return transactions.filter((t) => {
      if (txnFilterState !== "all" && t.restaurantState !== txnFilterState) return false;
      if (txnFilterDistrict !== "all" && t.restaurantDistrict !== txnFilterDistrict) return false;
      if (name && !(t.restaurantName ?? "").toLowerCase().includes(name)) return false;
      return true;
    });
  }, [transactions, txnFilterState, txnFilterDistrict, txnFilterName]);

  const txnActiveFilters = (txnFilterState !== "all" ? 1 : 0) + (txnFilterDistrict !== "all" ? 1 : 0) + (txnFilterName.trim() ? 1 : 0);

  const notifTargetRestaurants = useMemo(() => {
    return restaurants.filter((r) => {
      if (notifTargetRestaurantId && String(r.id) !== notifTargetRestaurantId) return false;
      if (notifTargetState && r.state !== notifTargetState) return false;
      if (notifTargetDistrict && r.district !== notifTargetDistrict) return false;
      if (notifTargetCity && (r.city ?? "").toLowerCase() !== notifTargetCity.toLowerCase()) return false;
      return true;
    });
  }, [notifTargetState, notifTargetDistrict, notifTargetCity, notifTargetRestaurantId, restaurants]);

  const notifCities = useMemo(() =>
    [...new Set(restaurants.map((r) => r.city).filter(Boolean) as string[])].sort(),
    [restaurants]);

  const notifStateNames = useMemo(() =>
    [...new Set(restaurants.map((r) => r.state).filter(Boolean) as string[])].sort(),
    [restaurants]);

  const notifDistricts = useMemo(() =>
    [...new Set(restaurants.filter((r) => r.state === notifTargetState).map((r) => r.district).filter(Boolean) as string[])].sort(),
    [restaurants, notifTargetState]);

  const pendingPayments = transactions.filter((t) => t.status === "pending").length;
  const exhaustedRests = restaurants.filter((r) => r.subscriptionStatus === "exhausted").length;
  const navItems = ADMIN_NAV_ITEMS(pendingPayments, exhaustedRests);

  const buildRestExportFilename = (ext: string) => {
    const datePart = new Date().toISOString().slice(0, 10);
    const locPart =
      filterDistrict !== "all"
        ? `-${filterDistrict.toLowerCase().replace(/\s+/g, "-")}`
        : filterState !== "all"
        ? `-${filterState.toLowerCase().replace(/\s+/g, "-")}`
        : "";
    return `restaurants${locPart}-${datePart}.${ext}`;
  };

  const buildRestExportRows = () =>
    filteredRestaurants.map((r) => ({
      "Restaurant Name": r.name,
      "Owner Email": r.ownerEmail ?? "",
      "Owner Phone": r.ownerPhone ?? "",
      "City": r.city,
      "District": r.district ?? "",
      "State": r.state ?? "",
      "Cuisine": r.cuisineType.replace(/_/g, " "),
      "Plan": r.planName ?? "",
      "Customers Used": r.customersUsed,
      "Customer Limit": r.customerLimit >= 999999 ? "Unlimited" : r.customerLimit,
      "Total Orders": r.totalOrders,
      "Total Revenue (₹)": (r.totalRevenue / 100).toFixed(2),
      "Status": r.subscriptionStatus,
      "Joined": new Date(r.createdAt).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
      }),
    }));

  const handleExportRestCSV = () => {
    setExportingRestCSV(true);
    try {
      const rows = buildRestExportRows();
      if (rows.length === 0) return;
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(","),
        ...rows.map((r) =>
          Object.values(r)
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildRestExportFilename("csv");
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingRestCSV(false);
    }
  };

  const handleExportRestXLSX = () => {
    setExportingRestXLSX(true);
    try {
      const rows = buildRestExportRows();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 24 }, { wch: 26 }, { wch: 16 }, { wch: 16 },
        { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 16 },
        { wch: 12 }, { wch: 16 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Restaurants");
      XLSX.writeFile(wb, buildRestExportFilename("xlsx"));
    } finally {
      setExportingRestXLSX(false);
    }
  };

  // ── Page header ──
  const PAGE_TITLES: Record<AdminSection, { title: string; desc: string; icon: React.ElementType }> = {
    overview: { title: "Overview", desc: "Platform-wide summary and alerts", icon: LayoutDashboard },
    restaurants: { title: "Restaurants", desc: `${activeRestsArr.length} active`, icon: Store },
    plans: { title: "Subscription Plans", desc: "Manage pricing tiers", icon: BarChart3 },
    payments: { title: "Payments", desc: `${pendingPayments} pending approval`, icon: CreditCard },
    customers: { title: "Customers", desc: `${customers.length} unique`, icon: Users },
    notifications: { title: "Send Notification", desc: "Broadcast to restaurants", icon: Bell },
    legal: { title: "Legal Pages", desc: "Terms & Conditions · Privacy Policy", icon: FileText },
    bills: { title: "Bill Metrics", desc: "Payment bill delivery analytics", icon: Receipt },
    resources: { title: "Resources", desc: `${adminResources.length} resources · ${adminResources.filter((r) => r.approvalStatus === "pending").length} pending`, icon: BookOpen },
  };
  const current = PAGE_TITLES[tab];

  if (loading) {
    return (
      <AdminShell activeSection={tab} onSectionChange={setTab} navItems={navItems}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell activeSection={tab} onSectionChange={setTab} navItems={navItems}>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

        {/* Global action error banner */}
        {actionError && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <current.icon className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{current.title}</h1>
              <p className="text-sm text-slate-500">{current.desc}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="border-slate-200 text-slate-600 hover:bg-slate-100" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Restaurants" value={stats?.totalRestaurants ?? 0} icon={Store} color="bg-blue-100 text-blue-600" />
              <StatCard label="Active" value={stats?.activeRestaurants ?? 0} icon={TrendingUp} color="bg-emerald-100 text-emerald-600" />
              <StatCard label="Suspended" value={stats?.suspendedRestaurants ?? 0} icon={Ban} color="bg-red-100 text-red-500" />
              <StatCard label="Quota Exhausted" value={stats?.exhaustedRestaurants ?? 0} icon={TrendingDown} color="bg-amber-100 text-amber-600"
                accent={exhaustedRests > 0 ? "border-amber-200" : undefined} />
              <StatCard label="Total Orders" value={stats?.totalOrders ?? 0} icon={ShoppingBag} color="bg-indigo-100 text-indigo-600" />
              <StatCard label="Order Revenue" value={`₹${((stats?.totalRevenue ?? 0) / 100).toLocaleString("en-IN")}`} icon={IndianRupee} color="bg-emerald-100 text-emerald-600" sub="From all orders" />
              <StatCard label="Total Customers" value={stats?.totalCustomers ?? 0} icon={Users} color="bg-purple-100 text-purple-600" />
              <StatCard label="Subscription Revenue" value={`₹${((stats?.subscriptionRevenue ?? 0) / 100).toLocaleString("en-IN")}`} icon={CreditCard} color="bg-indigo-100 text-indigo-600" sub="Total collected" />
            </div>

            {/* Pending payments alert */}
            {pendingPayments > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <h3 className="font-semibold text-amber-800">
                    {pendingPayments} Pending UPI Payment{pendingPayments > 1 ? "s" : ""} — Action Required
                  </h3>
                </div>
                {transactions.filter((t) => t.status === "pending").map((txn) => (
                  <div key={txn.id} className="bg-white border border-amber-200 rounded-lg px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{(txn as any).restaurantName ?? `Restaurant #${txn.restaurantId}`}</p>
                        <p className="text-xs text-slate-500">{txn.planName} · ₹{(txn.amount / 100).toLocaleString("en-IN")} · UPI</p>
                        {txn.razorpayPaymentId && (
                          <p className="text-xs font-mono mt-1 text-slate-700 bg-slate-100 rounded px-2 py-0.5 inline-block">
                            {txn.razorpayPaymentId.startsWith("UTR:") ? txn.razorpayPaymentId : `UTR: ${txn.razorpayPaymentId}`}
                          </p>
                        )}
                        {!txn.razorpayPaymentId && (
                          <p className="text-xs text-amber-600 mt-1 italic">No UTR submitted yet</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3"
                          disabled={actionId === txn.id} onClick={() => handleMarkPaid(txn.id)}>
                          {actionId === txn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle className="w-3 h-3 mr-1" /> Mark Paid</>}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 px-3"
                          disabled={actionId === txn.id} onClick={() => handleRejectTxn(txn.id)}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Restaurant status tabs */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="flex border-b border-slate-200">
                {(["active", "suspended", "exhausted", "disabled"] as const).map((t) => {
                  const counts = { active: activeRestsArr.length, suspended: suspendedRests.length, exhausted: exhaustedRestsArr.length, disabled: disabledRestsArr.length };
                  const labels = { active: "Active", suspended: "Suspended", exhausted: "Quota Exhausted", disabled: "Disabled" };
                  const colors = {
                    active: t === overviewRestTab ? "border-emerald-500 text-emerald-700 bg-emerald-50" : "text-slate-500 hover:text-emerald-600",
                    suspended: t === overviewRestTab ? "border-red-500 text-red-700 bg-red-50" : "text-slate-500 hover:text-red-600",
                    exhausted: t === overviewRestTab ? "border-amber-500 text-amber-700 bg-amber-50" : "text-slate-500 hover:text-amber-600",
                    disabled: t === overviewRestTab ? "border-slate-500 text-slate-700 bg-slate-50" : "text-slate-500 hover:text-slate-700",
                  };
                  const badgeColors = {
                    active: "bg-emerald-100 text-emerald-700",
                    suspended: "bg-red-100 text-red-600",
                    exhausted: "bg-amber-100 text-amber-600",
                    disabled: "bg-slate-200 text-slate-600",
                  };
                  return (
                    <button
                      key={t}
                      onClick={() => setOverviewRestTab(t)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all",
                        t === overviewRestTab ? colors[t] : "border-transparent " + colors[t]
                      )}
                    >
                      {labels[t]}
                      <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-bold", badgeColors[t])}>{counts[t]}</span>
                    </button>
                  );
                })}
              </div>
              <div className="divide-y divide-slate-100">
                {(overviewRestTab === "active" ? activeRestsArr : overviewRestTab === "suspended" ? suspendedRests : overviewRestTab === "exhausted" ? exhaustedRestsArr : disabledRestsArr).map((r) => (
                  <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-800 truncate">{r.name}</p>
                      <p className="text-xs text-slate-400">
                        {[r.district, r.state].filter(Boolean).join(", ") || r.city} · {r.planName ?? "No plan"}
                        {r.subscriptionExpiresAt && (
                          <span className={cn("ml-1.5", (() => {
                            const days = Math.ceil((new Date(r.subscriptionExpiresAt).getTime() - Date.now()) / 86400000);
                            return days <= 5 ? "text-red-500 font-medium" : days <= 10 ? "text-amber-500" : "text-slate-400";
                          })())}>
                            · {(() => {
                              const days = Math.ceil((new Date(r.subscriptionExpiresAt).getTime() - Date.now()) / 86400000);
                              return days <= 0 ? "expired" : `${days}d left`;
                            })()}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm text-slate-800">₹{r.totalRevenue.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-slate-400">{r.totalOrders} orders</p>
                    </div>
                    {overviewRestTab === "active" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600 hover:bg-amber-50 shrink-0"
                        onClick={() => { setSuspendTarget(r); setSuspendReason(""); }}>
                        <Ban className="w-3 h-3 mr-1" />Suspend
                      </Button>
                    )}
                    {overviewRestTab === "suspended" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-600 hover:bg-emerald-50 shrink-0"
                          disabled={actionId === r.id} onClick={() => handleActivate(r.id)}>
                          {actionId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle className="w-3 h-3 mr-1" />Activate</>}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:bg-red-50 shrink-0"
                          disabled={actionId === r.id}
                          onClick={() => setDeleteTarget({ id: r.id, name: r.name })}>
                          <Trash2 className="w-3 h-3 mr-1" />Delete
                        </Button>
                      </>
                    )}
                    {overviewRestTab === "exhausted" && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                          {r.customersUsed}/{r.customerLimit === 999999 ? "∞" : r.customerLimit} used
                        </span>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600 hover:bg-amber-50"
                          onClick={() => { setSuspendTarget(r); setSuspendReason(""); }}>
                          <Ban className="w-3 h-3 mr-1" />Suspend
                        </Button>
                      </div>
                    )}
                    {overviewRestTab === "disabled" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-indigo-600 hover:bg-indigo-50 shrink-0"
                        disabled={actionId === r.id} onClick={() => handleToggle(r.id)}>
                        {actionId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ToggleRight className="w-3.5 h-3.5 mr-1" />Enable</>}
                      </Button>
                    )}
                  </div>
                ))}
                {(overviewRestTab === "active" ? activeRestsArr : overviewRestTab === "suspended" ? suspendedRests : overviewRestTab === "exhausted" ? exhaustedRestsArr : disabledRestsArr).length === 0 && (
                  <div className="text-center py-10 text-slate-400">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No {overviewRestTab === "active" ? "active" : overviewRestTab === "suspended" ? "suspended" : overviewRestTab === "exhausted" ? "quota-exhausted" : "disabled"} restaurants</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Restaurants ── */}
        {tab === "restaurants" && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                <h2 className="font-semibold text-slate-700 shrink-0">
                  Restaurants
                  <span className="ml-1.5 text-slate-400 font-normal text-sm">
                    {filteredRestaurants.length === restaurants.length
                      ? `(${restaurants.length})`
                      : `(${filteredRestaurants.length} of ${restaurants.length})`}
                  </span>
                </h2>
              </div>

              {/* State filter */}
              <div className="relative">
                <select
                  value={filterState}
                  onChange={(e) => { setFilterState(e.target.value); setFilterDistrict("all"); }}
                  className="h-8 pl-3 pr-8 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                >
                  <option value="all">All States</option>
                  {STATE_NAMES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              </div>

              {/* District filter */}
              <div className="relative">
                <select
                  value={filterDistrict}
                  onChange={(e) => setFilterDistrict(e.target.value)}
                  disabled={filterState === "all" || availableDistricts.length === 0}
                  className="h-8 pl-3 pr-8 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="all">All Districts</option>
                  {availableDistricts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              </div>

              {/* Clear filters */}
              {(filterState !== "all" || filterDistrict !== "all") && (
                <button
                  onClick={() => { setFilterState("all"); setFilterDistrict("all"); }}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}

              {/* Export buttons */}
              <button
                onClick={handleExportRestCSV}
                disabled={exportingRestCSV || filteredRestaurants.length === 0}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Export as CSV"
              >
                {exportingRestCSV
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                CSV
              </button>
              <button
                onClick={handleExportRestXLSX}
                disabled={exportingRestXLSX || filteredRestaurants.length === 0}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Export as Excel"
              >
                {exportingRestXLSX
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <FileSpreadsheet className="w-3.5 h-3.5" />}
                Excel
              </button>
            </div>

            {restaurants.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Store className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No restaurants registered yet</p>
              </div>
            ) : filteredRestaurants.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Filter className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No restaurants match this filter</p>
                <p className="text-xs mt-1">Try a different state or district</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Restaurant</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Login Credentials</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-500">Plan</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-500">Quota</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-500">Revenue</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-500">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRestaurants.map((r) => {
                      const usedPct = r.customerLimit > 0 ? Math.min(100, Math.round((r.customersUsed / r.customerLimit) * 100)) : 0;
                      return (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{r.name}</p>
                            <p className="text-xs text-slate-400">
                              {[r.district, r.state].filter(Boolean).join(", ") || r.city}
                              {" · "}{r.cuisineType.replace(/_/g, " ")}
                            </p>
                            <span className="inline-block mt-0.5 text-xs font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">ID #{r.id}</span>
                          </td>
                          <td className="px-4 py-3 min-w-[200px]">
                            {/* Email row */}
                            <p className="text-xs text-slate-400 mb-0.5">Email</p>
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="font-mono text-xs text-slate-700 truncate max-w-[160px]">{r.ownerEmail ?? "—"}</span>
                              {r.ownerEmail && (
                                <button onClick={() => copyCredField(r.ownerEmail!, `email-${r.id}`)}
                                  className="text-slate-300 hover:text-indigo-500 transition-colors shrink-0">
                                  {credCopied === `email-${r.id}`
                                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                    : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>

                            {/* Password row */}
                            <p className="text-xs text-slate-400 mb-0.5">Password</p>
                            {r.ownerTempPassword ? (
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-xs text-slate-700">
                                  {showPassword === r.id ? r.ownerTempPassword : "••••••••••"}
                                </span>
                                <button
                                  onClick={() => setShowPassword(showPassword === r.id ? null : r.id)}
                                  className="text-slate-300 hover:text-indigo-500 transition-colors shrink-0">
                                  {showPassword === r.id
                                    ? <EyeOff className="w-3.5 h-3.5" />
                                    : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => copyCredField(r.ownerTempPassword!, `pw-${r.id}`)}
                                  className="text-slate-300 hover:text-indigo-500 transition-colors shrink-0">
                                  {credCopied === `pw-${r.id}`
                                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                    : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Not set — use Reset</span>
                            )}

                            {/* Reset button */}
                            <Button size="sm" variant="outline"
                              className="h-7 px-2 text-xs border-slate-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 mt-1.5"
                              onClick={() => openCredModal(r)}>
                              <KeyRound className="w-3 h-3 mr-1" />
                              Reset
                            </Button>

                            {r.ownerPhone && (
                              <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                                <Phone className="w-3 h-3" />{r.ownerPhone}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{r.planName ?? "No plan"}</span>
                          </td>
                          <td className="px-4 py-3">
                            {r.customerLimit > 0 ? (
                              <div className="min-w-[80px]">
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-slate-600">{r.customersUsed}</span>
                                  <span className="text-slate-400">{r.customerLimit === 999999 ? "∞" : r.customerLimit}</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5">
                                  <div className={cn("h-1.5 rounded-full transition-all", usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-amber-400" : "bg-indigo-500")} style={{ width: `${usedPct}%` }} />
                                </div>
                              </div>
                            ) : <span className="text-xs text-slate-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">₹{r.totalRevenue.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_SUB_COLORS[r.subscriptionStatus])}>
                              {r.subscriptionStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {r.subscriptionStatus === "suspended" ? (
                                <Button size="sm" variant="ghost" className="h-8 px-2 text-emerald-600 hover:bg-emerald-50 text-xs"
                                  disabled={actionId === r.id} onClick={() => handleActivate(r.id)}>
                                  {actionId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle className="w-3.5 h-3.5 mr-1" />Activate</>}
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" className="h-8 px-2 text-amber-600 hover:bg-amber-50 text-xs"
                                  onClick={() => { setSuspendTarget(r); setSuspendReason(""); }}>
                                  <Ban className="w-3.5 h-3.5 mr-1" />Suspend
                                </Button>
                              )}
                              <Button size="sm" variant="ghost"
                                className={cn("h-8 px-2 text-xs font-medium",
                                  r.isActive ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100")}
                                onClick={() => handleToggle(r.id)} disabled={actionId === r.id}>
                                {actionId === r.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : r.isActive
                                    ? <><ToggleRight className="w-4 h-4 mr-1" />Enabled</>
                                    : <><ToggleLeft className="w-4 h-4 mr-1" />Disabled</>}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Plans ── */}
        {tab === "plans" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => { setNewPlanOpen(true); setEditingPlan(null); setPlanForm(emptyPlanForm()); }}>
                <Plus className="w-4 h-4 mr-2" /> New Plan
              </Button>
            </div>
            {(newPlanOpen && !editingPlan) && (
              <PlanFormPanel
                editingPlan={null}
                planForm={planForm}
                planSaving={planSaving}
                onChangePlanForm={setPlanForm}
                onSave={handleSavePlan}
                onCancel={() => { setEditingPlan(null); setNewPlanOpen(false); setPlanForm(emptyPlanForm()); }}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <div key={plan.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  {editingPlan?.id === plan.id ? (
                    <PlanFormPanel
                      editingPlan={editingPlan}
                      planForm={planForm}
                      planSaving={planSaving}
                      onChangePlanForm={setPlanForm}
                      onSave={handleSavePlan}
                      onCancel={() => { setEditingPlan(null); setNewPlanOpen(false); setPlanForm(emptyPlanForm()); }}
                    />
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-slate-800">{plan.name}</h3>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                          plan.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                          {plan.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-indigo-600 mb-1">₹{(plan.price / 100).toLocaleString("en-IN")}</p>
                      <p className="text-sm text-slate-500 flex items-center gap-1 mb-1">
                        <Users className="w-3.5 h-3.5" />
                        {plan.customerLimit >= 999999 ? "Unlimited" : plan.customerLimit.toLocaleString()} customers
                      </p>
                      <p className="text-sm text-slate-500 flex items-center gap-1 mb-1">
                        <Clock className="w-3.5 h-3.5" />
                        {plan.validityValue} {plan.validityType === "months" ? (plan.validityValue === 1 ? "month" : "months") : (plan.validityValue === 1 ? "day" : "days")} validity
                      </p>
                      {plan.description && <p className="text-xs text-slate-400 mb-3">{plan.description}</p>}
                      <p className="text-xs text-slate-400 mb-4">
                        {restaurants.filter((r) => r.planId === plan.id).length} restaurants on this plan
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 border-slate-200" onClick={() => openEditPlan(plan)}>
                          <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-400 border-slate-200 hover:text-red-600 hover:border-red-200" onClick={() => handleDeletePlan(plan.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Payments ── */}
        {tab === "payments" && (
          <div className="space-y-5">

            {/* ── Payment Gateway Configuration ─────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* UPI ID Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Smartphone className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 text-sm">UPI ID</p>
                    <p className="text-xs text-slate-400">Platform UPI ID for subscription payments</p>
                  </div>
                </div>
                {editingUpi ? (
                  <div className="space-y-2">
                    <Input
                      value={upiIdEdit}
                      onChange={(e) => setUpiIdEdit(e.target.value)}
                      placeholder="yourupi@bank"
                      className="text-sm font-mono"
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveUpiId(); if (e.key === "Escape") setEditingUpi(false); }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white h-7 text-xs" onClick={handleSaveUpiId} disabled={upiSaving}>
                        {upiSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingUpi(false); setUpiIdEdit(paymentSettings?.upiId ?? ""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2.5">
                    <span className="font-mono text-sm text-orange-800 font-semibold">{paymentSettings?.upiId || "—"}</span>
                    <button onClick={() => setEditingUpi(true)} className="ml-2 text-orange-400 hover:text-orange-600 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Razorpay Configuration Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", paymentSettings?.razorpayConfigured ? "bg-blue-100" : "bg-slate-100")}>
                      <ShieldCheck className={cn("w-4 h-4", paymentSettings?.razorpayConfigured ? "text-blue-600" : "text-slate-400")} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700 text-sm">Razorpay Gateway</p>
                      <p className="text-xs text-slate-400">Card, Net banking, UPI via Razorpay</p>
                    </div>
                  </div>
                  {!editingRazorpay && (
                    <button
                      onClick={() => { setRzpKeyId(""); setRzpKeySecret(""); setRzpShowSecret(false); setEditingRazorpay(true); }}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                      title="Configure Razorpay keys"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {editingRazorpay ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Key ID <span className="text-slate-400">(rzp_live_… or rzp_test_…)</span></label>
                      <Input
                        value={rzpKeyId}
                        onChange={(e) => setRzpKeyId(e.target.value)}
                        placeholder="rzp_live_XXXXXXXXXXXX"
                        className="text-xs font-mono"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Key Secret</label>
                      <div className="relative">
                        <Input
                          type={rzpShowSecret ? "text" : "password"}
                          value={rzpKeySecret}
                          onChange={(e) => setRzpKeySecret(e.target.value)}
                          placeholder="••••••••••••••••••••"
                          className="text-xs font-mono pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setRzpShowSecret((s) => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {rzpShowSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">Leave a field blank to keep the existing value.</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs"
                        disabled={rzpSaving || (!rzpKeyId.trim() && !rzpKeySecret.trim())}
                        onClick={async () => {
                          setRzpSaving(true); setActionError(null);
                          try {
                            await apiFetch("/admin/payment-settings", {
                              method: "PUT",
                              body: JSON.stringify({ razorpayKeyId: rzpKeyId || undefined, razorpayKeySecret: rzpKeySecret || undefined }),
                            });
                            await fetchData();
                            setEditingRazorpay(false);
                          } catch (e) { if (!handleAuthError(e)) setActionError((e as Error).message); }
                          finally { setRzpSaving(false); }
                        }}
                      >
                        {rzpSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                        Save Keys
                      </Button>
                      {paymentSettings?.razorpayConfigured && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
                          disabled={rzpSaving}
                          onClick={async () => {
                            if (!confirm("Remove Razorpay keys? Owners will no longer be able to pay via Razorpay.")) return;
                            setRzpSaving(true);
                            try {
                              await apiFetch("/admin/payment-settings", { method: "PUT", body: JSON.stringify({ clearRazorpay: true }) });
                              await fetchData();
                              setEditingRazorpay(false);
                            } catch (e) { if (!handleAuthError(e)) setActionError((e as Error).message); }
                            finally { setRzpSaving(false); }
                          }}
                        >
                          Remove Keys
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingRazorpay(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paymentSettings?.razorpayConfigured ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                          <CheckCircle className="w-3 h-3" /> Active
                        </span>
                        {paymentSettings.razorpayKeyId && (
                          <p className="text-xs text-slate-400 font-mono mt-1">Key: {paymentSettings.razorpayKeyId}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                          <AlertCircle className="w-3 h-3" /> Not configured
                        </span>
                        <p className="text-xs text-slate-400 mt-1">Click the edit icon to enter your Razorpay Key ID and Key Secret.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Revenue Summary ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Total Collected</p>
                <p className="text-2xl font-bold text-emerald-700">₹{((paymentSettings?.collectedAmount ?? 0) / 100).toLocaleString("en-IN")}</p>
                <p className="text-xs text-emerald-500 mt-0.5">Confirmed subscription revenue</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Pending Payments</p>
                <p className="text-2xl font-bold text-amber-700">₹{((paymentSettings?.pendingAmount ?? 0) / 100).toLocaleString("en-IN")}</p>
                <p className="text-xs text-amber-500 mt-0.5">{paymentSettings?.pendingCount ?? 0} transaction{(paymentSettings?.pendingCount ?? 0) !== 1 ? "s" : ""} awaiting confirmation</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Total Transactions</p>
                <p className="text-2xl font-bold text-slate-700">{transactions.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">All time subscription payments</p>
              </div>
            </div>

            {/* ── Transactions Table ─────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="border-b border-slate-100">
                <div className="p-4 flex flex-wrap items-center gap-3">
                  <h2 className="font-semibold text-slate-700 flex-1 min-w-0">
                    Subscription Payments
                    <span className="ml-1.5 font-normal text-slate-400 text-sm">
                      ({filteredTransactions.length}{filteredTransactions.length !== transactions.length ? ` of ${transactions.length}` : ""})
                    </span>
                  </h2>
                  <button
                    onClick={() => setTxnFilterOpen((o) => !o)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                      txnFilterOpen || txnActiveFilters > 0
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                    )}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    Filter
                    {txnActiveFilters > 0 && (
                      <span className="bg-white text-indigo-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                        {txnActiveFilters}
                      </span>
                    )}
                  </button>
                  {txnActiveFilters > 0 && (
                    <button
                      onClick={() => { setTxnFilterState("all"); setTxnFilterDistrict("all"); setTxnFilterName(""); }}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <div className="flex gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Paid</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Pending</span>
                  </div>
                </div>
                {/* Expandable filter panel */}
                {txnFilterOpen && (
                  <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border-t border-slate-100">
                    <div className="space-y-1 pt-3">
                      <label className="text-xs font-medium text-slate-500">Restaurant Name</label>
                      <Input
                        value={txnFilterName}
                        onChange={(e) => setTxnFilterName(e.target.value)}
                        placeholder="Search by name…"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1 pt-3">
                      <label className="text-xs font-medium text-slate-500">State</label>
                      <select
                        value={txnFilterState}
                        onChange={(e) => { setTxnFilterState(e.target.value); setTxnFilterDistrict("all"); }}
                        className="w-full h-8 pl-2 pr-7 text-sm rounded-md border border-slate-200 bg-white text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value="all">All States</option>
                        {txnStates.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1 pt-3">
                      <label className="text-xs font-medium text-slate-500">District</label>
                      <select
                        value={txnFilterDistrict}
                        onChange={(e) => setTxnFilterDistrict(e.target.value)}
                        disabled={txnFilterState === "all" || txnDistricts.length === 0}
                        className="w-full h-8 pl-2 pr-7 text-sm rounded-md border border-slate-200 bg-white text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <option value="all">All Districts</option>
                        {txnDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
              {transactions.length === 0 ? (
                <div className="text-center py-16 text-slate-400"><CreditCard className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>No transactions yet</p></div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Filter className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No transactions match your filters</p>
                  <button onClick={() => { setTxnFilterState("all"); setTxnFilterDistrict("all"); setTxnFilterName(""); }} className="text-xs text-indigo-500 hover:underline mt-1">Clear filters</button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Restaurant</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">State</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">District</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Plan</th>
                        <th className="text-right px-4 py-3 font-medium text-slate-500">Amount</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Method</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Reference</th>
                        <th className="text-center px-4 py-3 font-medium text-slate-500">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Date</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTransactions.map((txn) => {
                        const ref = (txn as any).razorpayPaymentId as string | null;
                        const isUtr = ref?.startsWith("UTR:");
                        const displayRef = isUtr ? ref?.replace("UTR:", "UTR ") : ref;
                        return (
                          <tr key={txn.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-800">{txn.restaurantName ?? `#${txn.restaurantId}`}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{txn.restaurantState ?? <span className="text-slate-300">—</span>}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{txn.restaurantDistrict ?? <span className="text-slate-300">—</span>}</td>
                            <td className="px-4 py-3 text-slate-500">{txn.planName}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-800">₹{(txn.amount / 100).toLocaleString("en-IN")}</td>
                            <td className="px-4 py-3">
                              {txn.paymentMethod === "razorpay" ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                  <ShieldCheck className="w-3 h-3" /> Razorpay
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                                  <Smartphone className="w-3 h-3" /> UPI
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {displayRef ? (
                                <span className="font-mono text-xs text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded" title={ref ?? ""}>
                                  {displayRef.length > 18 ? displayRef.slice(0, 18) + "…" : displayRef}
                                </span>
                              ) : txn.status === "pending" ? (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                                  <Clock className="w-3 h-3" /> Awaiting
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                                txn.status === "paid" ? "bg-emerald-100 text-emerald-700" :
                                txn.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600")}>
                                {txn.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs">
                              {new Date(txn.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </td>
                            <td className="px-4 py-3">
                              {txn.status === "pending" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                  disabled={actionId === txn.id} onClick={() => handleMarkPaid(txn.id)}>
                                  {actionId === txn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Mark Paid"}
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Customers ── */}
        {tab === "customers" && (
          <div className="space-y-4">
            {/* Filters bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-500" />
                  Customers
                  <span className="text-xs font-normal text-slate-400">
                    {filteredCustomers.length} of {customers.length}
                  </span>
                </h2>
                <div className="flex items-center gap-2 ml-auto">
                  {(custFilterState !== "all" || custFilterDistrict !== "all" || custFilterCity !== "all" || custSearch) && (
                    <button
                      onClick={() => { setCustFilterState("all"); setCustFilterDistrict("all"); setCustFilterCity("all"); setCustSearch(""); }}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Clear filters
                    </button>
                  )}
                  <button
                    onClick={handleExportCSV}
                    disabled={exportingCSV || filteredCustomers.length === 0}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Export as CSV"
                  >
                    {exportingCSV
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Download className="w-3.5 h-3.5" />}
                    CSV
                  </button>
                  <button
                    onClick={handleExportXLSX}
                    disabled={exportingXLSX || filteredCustomers.length === 0}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Export as Excel"
                  >
                    {exportingXLSX
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FileSpreadsheet className="w-3.5 h-3.5" />}
                    Excel
                  </button>
                </div>
              </div>

              {/* Search + location filters in one row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Search */}
                <div className="relative">
                  <Smartphone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <Input
                    placeholder="Search name / phone…"
                    value={custSearch}
                    onChange={(e) => setCustSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>

                {/* State */}
                <select
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  value={custFilterState}
                  onChange={(e) => { setCustFilterState(e.target.value); setCustFilterDistrict("all"); setCustFilterCity("all"); }}
                >
                  <option value="all">All States</option>
                  {custStates.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                {/* District */}
                <select
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
                  value={custFilterDistrict}
                  onChange={(e) => { setCustFilterDistrict(e.target.value); setCustFilterCity("all"); }}
                  disabled={custFilterState === "all" || custDistricts.length === 0}
                >
                  <option value="all">All Districts</option>
                  {custDistricts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                {/* City */}
                <select
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
                  value={custFilterCity}
                  onChange={(e) => setCustFilterCity(e.target.value)}
                  disabled={custCities.length === 0}
                >
                  <option value="all">All Cities</option>
                  {custCities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              {customers.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No customer data yet</p>
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Filter className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No customers match these filters</p>
                  <p className="text-xs mt-1">Try clearing one or more filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Name / Phone</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">State</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">District</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">City</th>
                        <th className="text-right px-4 py-3 font-medium text-slate-500">Orders</th>
                        <th className="text-right px-4 py-3 font-medium text-slate-500">Total Spent</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Last Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCustomers.map((c) => (
                        <tr key={c.customerPhone} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{c.customerName || <span className="text-slate-400 italic">Unknown</span>}</p>
                            <span className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                              <Phone className="w-3 h-3" />{c.customerPhone}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{c.state ?? <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{c.district ?? <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{c.city ?? <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-right text-slate-700 font-medium">{c.totalOrders}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">₹{c.totalSpent.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {new Date(c.lastOrderAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Notifications ── */}
        {tab === "notifications" && (
          <div className="max-w-2xl space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">

              {/* ── Audience targeting ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Target Audience</Label>
                  {(notifTargetState || notifTargetDistrict || notifTargetCity || notifTargetRestaurantId) && (
                    <button
                      onClick={() => { setNotifTargetState(""); setNotifTargetDistrict(""); setNotifTargetCity(""); setNotifTargetRestaurantId(""); }}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                </div>

                {/* 2×2 filter grid — all always visible */}
                <div className="grid grid-cols-2 gap-3">
                  {/* State */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">State</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      value={notifTargetState}
                      onChange={(e) => { setNotifTargetState(e.target.value); setNotifTargetDistrict(""); }}
                    >
                      <option value="">All States</option>
                      {notifStateNames.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* District */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">District</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      value={notifTargetDistrict}
                      onChange={(e) => setNotifTargetDistrict(e.target.value)}
                      disabled={!notifTargetState || notifDistricts.length === 0}
                    >
                      <option value="">All Districts</option>
                      {notifDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  {/* City */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">City</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      value={notifTargetCity}
                      onChange={(e) => setNotifTargetCity(e.target.value)}
                    >
                      <option value="">All Cities</option>
                      {notifCities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Restaurant Name */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Restaurant Name</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      value={notifTargetRestaurantId}
                      onChange={(e) => setNotifTargetRestaurantId(e.target.value)}
                    >
                      <option value="">All Restaurants</option>
                      {restaurants.map((r) => (
                        <option key={r.id} value={String(r.id)}>
                          {r.name}{r.city ? ` — ${r.city}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Audience preview badge */}
                <div className={cn(
                  "flex items-center gap-2 text-sm rounded-lg px-3.5 py-2.5 border",
                  notifTargetRestaurants.length === 0
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-indigo-50 border-indigo-100 text-indigo-700"
                )}>
                  <Users className="w-4 h-4 shrink-0" />
                  {notifTargetRestaurants.length === 0
                    ? "No restaurants match the selected filters"
                    : notifTargetRestaurants.length === restaurants.length
                      ? `All ${restaurants.length} restaurants will receive this notification`
                      : (
                        <span>
                          <span className="font-semibold">{notifTargetRestaurants.length}</span>
                          {" "}restaurant{notifTargetRestaurants.length !== 1 ? "s" : ""} will receive this: {" "}
                          <span className="opacity-70">
                            {notifTargetRestaurants.slice(0, 4).map((r) => r.name).join(", ")}
                            {notifTargetRestaurants.length > 4 ? ` +${notifTargetRestaurants.length - 4} more` : ""}
                          </span>
                        </span>
                      )
                  }
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* ── Message fields ── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Title</Label>
                  <Input placeholder="e.g. Platform Update" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Type</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    value={notifType}
                    onChange={(e) => setNotifType(e.target.value as typeof notifType)}
                  >
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error / Alert</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Message</Label>
                <textarea
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  rows={4}
                  placeholder="Write your message here..."
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                />
              </div>
              {notifSent && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-2.5 text-sm">
                  <CheckCircle className="w-4 h-4" /> Notification sent to {notifSentCount} restaurant{notifSentCount !== 1 ? "s" : ""} successfully!
                </div>
              )}
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white w-full"
                disabled={notifSending || !notifTitle || !notifMessage || notifTargetRestaurants.length === 0}
                onClick={handleSendNotif}
              >
                {notifSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                {`Send to ${notifTargetRestaurants.length} Restaurant${notifTargetRestaurants.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Legal Pages ── */}
        {tab === "legal" && (
          <div className="space-y-6">
            {/* Quick links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a
                href="/portal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-200 transition-colors">
                  <ScrollText className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">Terms &amp; Conditions</p>
                  <p className="text-xs text-slate-400 mt-0.5">11 sections · Effective January 1, 2025</p>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
              </a>
              <a
                href="/portal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-200 transition-colors">
                  <FileText className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">Privacy Policy</p>
                  <p className="text-xs text-slate-400 mt-0.5">12 sections · Effective January 1, 2025</p>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
              </a>
            </div>

            {/* Terms & Conditions inline */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <ScrollText className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-slate-800">Terms &amp; Conditions</h2>
                  <p className="text-xs text-slate-400">Bitebend Restaurant Platform · Effective: January 1, 2025</p>
                </div>
              </div>
              <div className="px-6 py-6 space-y-6 text-sm text-slate-600 leading-relaxed">
                {[
                  { title: "1. Acceptance of Terms", body: 'By registering on Bitebend ("Platform", "we", "us") and using our restaurant management services, you ("Restaurant Owner", "you") agree to be bound by these Terms & Conditions. If you do not agree, you must not use the Platform.' },
                  { title: "2. Services Provided", body: null, list: ["Digital menu creation and management", "QR code generation for table-based ordering", "Live order tracking and dashboard", "Customer analytics and reporting", "Subscription-based customer quota management"], intro: "Bitebend provides a QR-based digital ordering and restaurant management platform, including:" },
                  { title: "3. Account Registration", body: "You must provide accurate, complete, and current information during registration. You are responsible for maintaining the security of your account credentials. Bitebend reserves the right to suspend or terminate accounts found to provide false information." },
                  { title: "4. Subscription Plans & Payments", body: "Access to certain features requires an active subscription plan. Plans are usage-based, charged per customer quota (e.g., ₹199 for 500 customers). Payments are processed via Razorpay or UPI transfer. All prices are in Indian Rupees (INR) and inclusive of applicable taxes. Subscriptions do not auto-renew. Once your customer quota is exhausted, you must recharge to continue accepting orders. Refunds are not provided for unused quota." },
                  { title: "5. Restaurant Responsibilities", body: null, list: ["Maintain accurate and up-to-date menu information including prices and availability", "Fulfil orders placed by customers through the Platform in a timely manner", "Comply with all applicable food safety regulations and local laws", "Not use the Platform for any unlawful purpose", "Not attempt to reverse-engineer, scrape, or misuse Platform systems"], intro: "As a restaurant owner, you agree to:" },
                  { title: "6. Intellectual Property", body: "All content, design, and technology on the Platform belongs to Bitebend. You retain ownership of your restaurant's menu data and content but grant Bitebend a licence to display it on the Platform." },
                  { title: "7. Limitation of Liability", body: "Bitebend is not liable for any loss of revenue, data, or business opportunity arising from Platform downtime, service interruptions, or third-party payment failures. Our total liability to you shall not exceed the amount paid by you in the three months preceding the claim." },
                  { title: "8. Termination", body: "We reserve the right to suspend or terminate your account if you violate these Terms, engage in fraudulent activity, or abuse the Platform. You may delete your account at any time by contacting support." },
                  { title: "9. Modifications", body: "Bitebend may update these Terms at any time. Continued use of the Platform after changes are posted constitutes acceptance of the revised Terms. We will notify registered owners of material changes via the in-platform notification system." },
                  { title: "10. Governing Law", body: "These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Mumbai, Maharashtra, India." },
                  { title: "11. Contact", body: "For questions about these Terms, please contact us at support@bitebend.in." },
                ].map((s) => (
                  <div key={s.title} className="space-y-1.5">
                    <h3 className="font-semibold text-slate-800">{s.title}</h3>
                    {s.intro && <p>{s.intro}</p>}
                    {s.list && (
                      <ul className="list-disc pl-5 space-y-1">
                        {s.list.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                    {s.body && <p>{s.body}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Privacy Policy inline */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-slate-800">Privacy Policy</h2>
                  <p className="text-xs text-slate-400">Bitebend Restaurant Platform · Effective: January 1, 2025</p>
                </div>
              </div>
              <div className="px-6 py-6 space-y-6 text-sm text-slate-600 leading-relaxed">
                {[
                  { title: "1. Introduction", body: 'Bitebend ("we", "us", "Platform") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and share information when you use our restaurant management platform. By registering, you consent to the practices described here.' },
                  { title: "2. Information We Collect", intro: "We collect the following categories of information:", list: ["Account information — name, email address, phone number, and password (stored as a secure hash)", "Restaurant information — restaurant name, address, city, state, cuisine type, and UPI/payment details", "Menu & order data — categories, items, prices, and customer orders placed through your QR menu", "Payment records — transaction IDs, payment method, and subscription history (we do not store full card numbers)", "Usage data — platform activity logs, device information, and IP addresses for security and analytics"] },
                  { title: "3. How We Use Your Information", intro: "We use the collected information to:", list: ["Provide, operate, and improve the Platform", "Process subscription payments and manage your quota", "Send platform notifications and service updates", "Detect and prevent fraud, abuse, and security incidents", "Comply with applicable Indian laws and regulations"] },
                  { title: "4. Information Sharing", body: "We do not sell your personal information. We may share data with: (a) payment processors (Razorpay) to handle transactions; (b) cloud infrastructure providers for hosting; (c) law enforcement when required by law. All third-party processors are bound by data processing agreements." },
                  { title: "5. Data Retention", body: "We retain your account data for as long as your account is active. Upon account deletion, personal data is removed within 30 days, except where retention is required by law (e.g., financial records retained for 7 years per Indian accounting standards)." },
                  { title: "6. Data Security", body: "We implement industry-standard security measures including HTTPS encryption, bcrypt password hashing, and secure session management. However, no system is completely secure; you are responsible for maintaining the confidentiality of your login credentials." },
                  { title: "7. Your Rights", intro: "As a registered restaurant owner, you have the right to:", list: ["Access the personal data we hold about you", "Request correction of inaccurate data", "Request deletion of your account and associated data", "Withdraw consent for data processing (subject to contractual obligations)", "Lodge a complaint with the relevant data protection authority"] },
                  { title: "8. Cookies", body: "We use session cookies to maintain your login state. These are essential for the Platform to function and cannot be disabled. We do not use third-party tracking or advertising cookies." },
                  { title: "9. Customer Data", body: "When customers scan your QR code, we collect minimal session data to process orders. This data is associated with your restaurant account. You are responsible for informing your customers about data collection as required by applicable laws." },
                  { title: "10. Children's Privacy", body: "The Platform is intended for use by restaurant owners (18 years and above). We do not knowingly collect personal information from minors." },
                  { title: "11. Changes to This Policy", body: "We may update this Privacy Policy periodically. Material changes will be notified via the in-platform notification system. Continued use of the Platform after changes constitutes acceptance." },
                  { title: "12. Contact & Grievance Officer", body: "For privacy concerns or data requests, contact our Grievance Officer at support@bitebend.in. We will respond within 30 days as required under India's Information Technology Act, 2000 and IT (Amendment) Act, 2008." },
                ].map((s) => (
                  <div key={s.title} className="space-y-1.5">
                    <h3 className="font-semibold text-slate-800">{s.title}</h3>
                    {s.intro && <p>{s.intro}</p>}
                    {s.list && (
                      <ul className="list-disc pl-5 space-y-1">
                        {s.list.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                    {s.body && <p>{s.body}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Delete Restaurant</h3>
                <p className="text-xs text-slate-400">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-slate-800">{deleteTarget.name}</span>?
              This will remove the restaurant account, menu data, QR references, and all associated records.
            </p>
            {actionError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>
            )}
            <div className="flex items-center gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={actionId === deleteTarget.id}>
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={actionId === deleteTarget.id}
                onClick={handleConfirmDelete}
              >
                {actionId === deleteTarget.id
                  ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  : <Trash2 className="w-4 h-4 mr-2" />}
                Delete Permanently
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Suspend Modal ── */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                <Ban className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Suspend Restaurant</h3>
                <p className="text-xs text-slate-400">This will disable all ordering</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Suspending <span className="font-semibold text-slate-800">{suspendTarget.name}</span> will disable all ordering and notify the owner.
            </p>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Reason for suspension (sent to owner)..."
              rows={3}
              className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <div className="flex items-center gap-3 justify-end">
              <Button variant="outline" onClick={() => setSuspendTarget(null)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={actionId === suspendTarget.id} onClick={handleSuspend}>
                {actionId === suspendTarget.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Suspend Account
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Credentials Modal ── */}
      {credModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCredModal(null)}
          onKeyDown={(e) => e.key === "Escape" && setCredModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >

            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Login Credentials</h3>
                  <p className="text-xs text-slate-400 truncate max-w-[220px]">{credModal.restaurantName}</p>
                </div>
              </div>
              <button
                aria-label="Close credentials modal"
                onClick={() => setCredModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Restaurant ID */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">Restaurant ID</p>
                  <p className="font-mono font-bold text-slate-800 text-lg">#{credModal.restaurantId}</p>
                </div>
                <button onClick={() => copyCredField(String(credModal.restaurantId), "rid")}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors">
                  {credCopied === "rid" ? <><CheckCircle className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Login Email (Username)</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm text-slate-800 break-all">{credModal.email || "—"}</p>
                  {credModal.email && (
                    <button onClick={() => copyCredField(credModal.email, "email")}
                      className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors shrink-0">
                      {credCopied === "email" ? <><CheckCircle className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </button>
                  )}
                </div>
              </div>

              {credModal.password && (
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">New Password (shown once)</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-sm text-slate-800 tracking-wider">
                      {showModalPassword ? credModal.password : "••••••••••••"}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => setShowModalPassword((v) => !v)}
                        className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                        {showModalPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => copyCredField(credModal.password!, "pwd")}
                        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors">
                        {credCopied === "pwd" ? <><CheckCircle className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Copy this now — it won't be shown again after you close this dialog.
                  </p>
                </div>
              )}
            </div>

            {/* Reset button */}
            <div className="space-y-2">
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={credResetting}
                onClick={handleResetPassword}
              >
                {credResetting
                  ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  : <KeyRound className="w-4 h-4 mr-2" />}
                {credModal.password ? "Generate Another Password" : "Generate New Password"}
              </Button>
              <p className="text-xs text-center text-slate-400">
                This will immediately replace the owner's current password. Share the new credentials with them securely.
              </p>
            </div>

          </div>
        </div>
      )}

        {/* ── Bill Metrics ── */}
        {tab === "bills" && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-slate-400" />
                  <p className="text-xs text-slate-500 font-medium">Total Bills Sent</p>
                </div>
                <p className="text-2xl font-bold text-slate-800">{billStats?.total ?? "—"}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <p className="text-xs text-slate-500 font-medium">Active Links</p>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{billStats?.active ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-1">Not yet expired</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                  <p className="text-xs text-slate-500 font-medium">Customer Opened</p>
                </div>
                <p className="text-2xl font-bold text-indigo-600">{billStats?.opened ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-1">Bill viewed by customer</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-violet-500" />
                  <p className="text-xs text-slate-500 font-medium">Open Rate</p>
                </div>
                <p className="text-2xl font-bold text-slate-800">{billStats?.openRate ?? "—"}%</p>
                <p className="text-xs text-slate-400 mt-1">All-time</p>
              </div>
            </div>

            {/* Last 24h */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <Clock className="w-4 h-4 text-slate-500" />
                <h3 className="font-semibold text-slate-800 text-sm">Last 24 Hours</h3>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-100 p-6">
                <div className="pr-6">
                  <p className="text-xs text-slate-400 mb-1">Bills Generated</p>
                  <p className="text-3xl font-bold text-slate-800">{billStats?.last24h.generated ?? "—"}</p>
                </div>
                <div className="pl-6">
                  <p className="text-xs text-slate-400 mb-1">Customer Opened</p>
                  <p className="text-3xl font-bold text-indigo-600">{billStats?.last24h.opened ?? "—"}</p>
                </div>
              </div>
            </div>

            {/* Expired */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Expired Links</p>
                  <p className="text-xs text-slate-400">24-hour TTL elapsed</p>
                </div>
              </div>
              <p className="text-xl font-semibold text-slate-500">{billStats?.expired ?? "—"}</p>
            </div>
          </div>
        )}

        {/* ── Resources ── */}
        {tab === "resources" && (
          <div className="space-y-5">
            {/* Action bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {(["all", "pending", "approved", "rejected"] as const).map((f) => {
                  const count = f === "all" ? adminResources.length
                    : adminResources.filter((r) => r.approvalStatus === f).length;
                  return (
                    <button key={f} onClick={() => setResFilter(f)}
                      className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors capitalize",
                        resFilter === f
                          ? f === "pending" ? "bg-amber-500 text-white border-amber-500"
                            : f === "approved" ? "bg-emerald-600 text-white border-emerald-600"
                            : f === "rejected" ? "bg-red-500 text-white border-red-500"
                            : "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      )}>
                      {f === "all" ? "All" : f} <span className="ml-0.5 opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
              <Button size="sm" onClick={() => setResForm(emptyResForm())}
                className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Resource
              </Button>
            </div>

            {/* Create / Edit form */}
            {resForm && (
              <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">{resForm.id ? "Edit Resource" : "New Resource"}</h3>
                  <button onClick={() => setResForm(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Type *</Label>
                    <select value={resForm.type}
                      onChange={(e) => setResForm((f) => f ? { ...f, type: e.target.value } : f)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      {(["video", "pdf", "link", "plan", "faq"] as const).map((t) => (
                        <option key={t} value={t}>{t.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <select value={resForm.status}
                      onChange={(e) => setResForm((f) => f ? { ...f, status: e.target.value } : f)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Approval</Label>
                    <select value={resForm.approvalStatus}
                      onChange={(e) => setResForm((f) => f ? { ...f, approvalStatus: e.target.value } : f)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Display Order</Label>
                    <Input type="number" value={resForm.displayOrder}
                      onChange={(e) => setResForm((f) => f ? { ...f, displayOrder: parseInt(e.target.value) || 0 } : f)} />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Title *</Label>
                    <Input value={resForm.title}
                      onChange={(e) => setResForm((f) => f ? { ...f, title: e.target.value } : f)}
                      placeholder="Resource title" />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input value={resForm.description}
                      onChange={(e) => setResForm((f) => f ? { ...f, description: e.target.value } : f)}
                      placeholder="Brief description" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <Input value={resForm.category}
                      onChange={(e) => setResForm((f) => f ? { ...f, category: e.target.value } : f)}
                      placeholder="e.g. Setup, Payments" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">URL</Label>
                    <Input value={resForm.url}
                      onChange={(e) => setResForm((f) => f ? { ...f, url: e.target.value } : f)}
                      placeholder="https://" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tags (comma-separated)</Label>
                    <Input value={resForm.tags}
                      onChange={(e) => setResForm((f) => f ? { ...f, tags: e.target.value } : f)}
                      placeholder="setup, tutorial, demo" />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input type="checkbox" id="res-featured" checked={resForm.featured}
                      onChange={(e) => setResForm((f) => f ? { ...f, featured: e.target.checked } : f)}
                      className="w-4 h-4 rounded accent-indigo-600" />
                    <label htmlFor="res-featured" className="text-sm font-medium text-slate-700">Featured</label>
                  </div>

                  {/* Video-specific */}
                  {resForm.type === "video" && (<>
                    <div className="space-y-1">
                      <Label className="text-xs">Duration</Label>
                      <Input value={resForm.duration}
                        onChange={(e) => setResForm((f) => f ? { ...f, duration: e.target.value } : f)}
                        placeholder="3:24" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Video Source</Label>
                      <select value={resForm.videoSource}
                        onChange={(e) => setResForm((f) => f ? { ...f, videoSource: e.target.value } : f)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                        <option value="youtube">YouTube</option>
                        <option value="external">External</option>
                        <option value="self-hosted">Self-hosted</option>
                      </select>
                    </div>
                  </>)}

                  {/* PDF-specific */}
                  {resForm.type === "pdf" && (
                    <div className="space-y-1">
                      <Label className="text-xs">File URL</Label>
                      <Input value={resForm.fileUrl}
                        onChange={(e) => setResForm((f) => f ? { ...f, fileUrl: e.target.value } : f)}
                        placeholder="/docs/guide.pdf or https://..." />
                    </div>
                  )}

                  {/* Plan-specific */}
                  {resForm.type === "plan" && (<>
                    <div className="space-y-1">
                      <Label className="text-xs">Plan Name</Label>
                      <Input value={resForm.planName}
                        onChange={(e) => setResForm((f) => f ? { ...f, planName: e.target.value } : f)}
                        placeholder="Starter" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Price</Label>
                      <Input value={resForm.planPrice}
                        onChange={(e) => setResForm((f) => f ? { ...f, planPrice: e.target.value } : f)}
                        placeholder="₹199" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Period</Label>
                      <Input value={resForm.planPeriod}
                        onChange={(e) => setResForm((f) => f ? { ...f, planPeriod: e.target.value } : f)}
                        placeholder="per 500 customers" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Badge</Label>
                      <Input value={resForm.planBadge}
                        onChange={(e) => setResForm((f) => f ? { ...f, planBadge: e.target.value } : f)}
                        placeholder="Most Popular" />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs">Features (one per line)</Label>
                      <textarea value={resForm.planFeatures}
                        onChange={(e) => setResForm((f) => f ? { ...f, planFeatures: e.target.value } : f)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 h-24 resize-none"
                        placeholder={"Up to 500 unique customers\nQR table ordering\nBasic menu management"} />
                    </div>
                  </>)}

                  {/* Link-specific */}
                  {resForm.type === "link" && (<>
                    <div className="space-y-1">
                      <Label className="text-xs">Icon Name</Label>
                      <Input value={resForm.iconName}
                        onChange={(e) => setResForm((f) => f ? { ...f, iconName: e.target.value } : f)}
                        placeholder="calendar, globe, mail..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Icon Color Classes</Label>
                      <Input value={resForm.iconColor}
                        onChange={(e) => setResForm((f) => f ? { ...f, iconColor: e.target.value } : f)}
                        placeholder="bg-blue-50 text-blue-600 border-blue-200" />
                    </div>
                  </>)}

                  {/* FAQ-specific */}
                  {resForm.type === "faq" && (<>
                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs">Question</Label>
                      <Input value={resForm.question}
                        onChange={(e) => setResForm((f) => f ? { ...f, question: e.target.value } : f)}
                        placeholder="How does QR ordering work?" />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs">Answer</Label>
                      <textarea value={resForm.answer}
                        onChange={(e) => setResForm((f) => f ? { ...f, answer: e.target.value } : f)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 h-24 resize-none"
                        placeholder="Detailed answer..." />
                    </div>
                  </>)}
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <Button variant="outline" size="sm" onClick={() => setResForm(null)}>
                    <X className="w-3.5 h-3.5 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    disabled={resSaving || !resForm.title.trim() || !resForm.type}
                    onClick={handleSaveResource}>
                    {resSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                    {resForm.id ? "Update" : "Create"}
                  </Button>
                </div>
              </div>
            )}

            {/* Resource list */}
            {filteredResources.length === 0 ? (
              <div className="text-center py-14 text-slate-400">
                <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-sm">
                  {resFilter === "all" ? "No resources yet" : `No ${resFilter} resources`}
                </p>
                {resFilter === "all" && (
                  <p className="text-xs mt-1">Click "Add Resource" to create your first one</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredResources.map((r) => (
                  <div key={r.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold uppercase",
                        r.type === "video" ? "bg-red-100 text-red-600"
                          : r.type === "pdf" ? "bg-blue-100 text-blue-600"
                          : r.type === "link" ? "bg-green-100 text-green-600"
                          : r.type === "plan" ? "bg-purple-100 text-purple-600"
                          : "bg-amber-100 text-amber-600"
                      )}>
                        {r.type.slice(0, 3)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm text-slate-800 truncate">{r.title}</p>
                          {r.featured && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">★ Featured</span>
                          )}
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold",
                            r.approvalStatus === "approved" ? "bg-emerald-100 text-emerald-700"
                              : r.approvalStatus === "rejected" ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          )}>{r.approvalStatus}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold",
                            r.status === "active" ? "bg-blue-100 text-blue-700"
                              : r.status === "archived" ? "bg-slate-100 text-slate-500"
                              : "bg-gray-100 text-gray-500"
                          )}>{r.status}</span>
                        </div>
                        {r.description && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">{r.description}</p>
                        )}
                        {r.category && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{r.category}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1.5 items-center shrink-0 flex-wrap">
                      {r.approvalStatus === "pending" && (<>
                        <Button size="sm" variant="outline"
                          className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-7 px-2"
                          disabled={resActionId === r.id}
                          onClick={() => handleResApprove(r.id)}>
                          {resActionId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline"
                          className="text-xs border-red-200 text-red-600 hover:bg-red-50 h-7 px-2"
                          disabled={resActionId === r.id}
                          onClick={() => handleResReject(r.id)}>
                          <Ban className="w-3 h-3 mr-1" /> Reject
                        </Button>
                      </>)}
                      {r.approvalStatus === "rejected" && (
                        <Button size="sm" variant="outline"
                          className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-7 px-2"
                          disabled={resActionId === r.id}
                          onClick={() => handleResApprove(r.id)}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Re-approve
                        </Button>
                      )}
                      <Button size="sm" variant="ghost"
                        className={cn("text-xs h-7 px-2 font-bold", r.featured ? "text-amber-500" : "text-slate-300 hover:text-amber-400")}
                        disabled={resActionId === r.id}
                        title="Toggle featured"
                        onClick={() => handleResFeature(r.id)}>
                        ★
                      </Button>
                      <Button size="sm" variant="outline"
                        className="text-xs h-7 px-2 text-slate-500"
                        onClick={() => setResForm(resourceToForm(r))}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline"
                        className="text-xs border-red-200 text-red-500 hover:bg-red-50 h-7 px-2"
                        disabled={resActionId === r.id}
                        onClick={() => handleResDelete(r.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

    </AdminShell>
  );
}
