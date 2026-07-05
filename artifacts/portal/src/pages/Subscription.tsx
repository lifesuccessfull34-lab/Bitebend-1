import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiFetch } from "@/lib/api";
import type { SubscriptionPlan, SubscriptionTransaction, Restaurant, Notification } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Loader2, Users, IndianRupee, BellOff,
  Zap, Star, Crown, RefreshCw, AlertTriangle,
  Copy, Check, X, Smartphone, CreditCard, CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open(): void };
  }
}

const PLAN_ICONS = [Zap, Star, Crown, IndianRupee];
const PLAN_GRADIENTS = [
  "from-slate-50 to-slate-100 border-slate-200",
  "from-blue-50 to-blue-100 border-blue-200",
  "from-purple-50 to-purple-100 border-purple-200",
  "from-amber-50 to-amber-100 border-amber-200",
];

interface PaymentConfig {
  razorpayAvailable: boolean;
  upiId: string;
}

interface UpiModalState {
  transactionId: number;
  amount: number;
  planName: string;
  upiId: string;
  customersAdded: number;
}

export default function Subscription() {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [transactions, setTransactions] = useState<SubscriptionTransaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({ razorpayAvailable: false, upiId: "bitebend@upi" });
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<number | null>(null);
  const [tab, setTab] = useState<"plans" | "history" | "notifications">("plans");

  // UPI modal state
  const [upiModal, setUpiModal] = useState<UpiModalState | null>(null);
  const [utrRef, setUtrRef] = useState("");
  const [confirmingUpi, setConfirmingUpi] = useState(false);
  const [upiSuccess, setUpiSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [utrError, setUtrError] = useState("");

  const [loadError, setLoadError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [rest, plns, txns, notifs, config] = await Promise.all([
        apiFetch<Restaurant>("/owner/restaurant"),
        apiFetch<SubscriptionPlan[]>("/subscription/plans"),
        apiFetch<SubscriptionTransaction[]>("/subscription/transactions"),
        apiFetch<Notification[]>("/subscription/notifications"),
        apiFetch<PaymentConfig>("/subscription/payment-config"),
      ]);
      setRestaurant(rest);
      setPlans(plns);
      setTransactions(txns);
      setNotifications(notifs);
      setPaymentConfig(config);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadRazorpay = () =>
    new Promise<void>((resolve) => {
      if (window.Razorpay) { resolve(); return; }
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve();
      document.body.appendChild(s);
    });

  const copyUpiId = async (upiId: string) => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // Called when user clicks Subscribe/Recharge — Razorpay is the only method
  // exposed in the UI. UPI backend support is retained but not surfaced here.
  const handleSubscribe = async (plan: SubscriptionPlan, paymentMethod: "upi" | "razorpay") => {
    setPaying(plan.id);
    try {
      const orderRes = await apiFetch<{
        transactionId: number;
        amount: number;
        planName: string;
        paymentMethod: string;
        razorpayOrderId: string | null;
        keyId: string | null;
        upiId?: string;
      }>(`/subscription/plans/${plan.id}/order`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod }),
      });

      if (paymentMethod === "upi" || !orderRes.razorpayOrderId || !orderRes.keyId) {
        setUtrRef("");
        setUtrError("");
        setUpiSuccess(false);
        setUpiModal({
          transactionId: orderRes.transactionId,
          amount: orderRes.amount,
          planName: orderRes.planName,
          upiId: orderRes.upiId || paymentConfig.upiId,
          customersAdded: plan.customerLimit,
        });
        return;
      }

      // Razorpay checkout
      await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: orderRes.keyId,
          amount: Math.round(orderRes.amount * 100), // Razorpay requires paise; orderRes.amount is in rupees
          currency: "INR",
          name: "Bitebend",
          description: `${orderRes.planName} Plan — Recharge`,
          order_id: orderRes.razorpayOrderId,
          prefill: { name: user?.name, email: user?.email },
          theme: { color: "#f97316" },
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            await apiFetch("/subscription/verify", {
              method: "POST",
              body: JSON.stringify({
                transactionId: orderRes.transactionId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            await fetchData();
            resolve();
          },
          modal: { ondismiss: () => reject(new Error("cancelled")) },
        });
        rzp.open();
      });
    } catch (err) {
      if (err instanceof Error && err.message !== "cancelled") {
        alert(err.message);
      }
    } finally {
      setPaying(null);
    }
  };

  const handleUpiConfirm = async () => {
    if (!upiModal) return;
    const trimmed = utrRef.trim();
    if (!trimmed) {
      setUtrError("Please enter your UTR / transaction reference number.");
      return;
    }
    if (trimmed.length < 6) {
      setUtrError("UTR reference must be at least 6 characters.");
      return;
    }
    setUtrError("");
    setConfirmingUpi(true);
    try {
      await apiFetch<{ pending: boolean }>("/subscription/verify", {
        method: "POST",
        body: JSON.stringify({ transactionId: upiModal.transactionId, utrRef: trimmed }),
      });
      setUpiSuccess(true);
      await fetchData();
    } catch (err) {
      setUtrError(err instanceof Error ? err.message : "Verification failed. Please try again.");
    } finally {
      setConfirmingUpi(false);
    }
  };

  const closeUpiModal = () => {
    setUpiModal(null);
    setUtrRef("");
    setUtrError("");
    setUpiSuccess(false);
    setCopied(false);
    setPaying(null);
  };

  const markRead = async (id: number) => {
    await apiFetch(`/subscription/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((n) => n.map((x) => x.id === id ? { ...x, isRead: true } : x));
  };

  const isUnlimited = (restaurant?.customerLimit ?? 0) >= 999999;
  const usedPct = !isUnlimited && restaurant && restaurant.customerLimit > 0
    ? Math.min(100, Math.round((restaurant.customersUsed / restaurant.customerLimit) * 100))
    : 0;

  const daysRemaining = (() => {
    if (!restaurant?.subscriptionExpiresAt) return null;
    const diff = new Date(restaurant.subscriptionExpiresAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  })();

  const expiryDateLabel = restaurant?.subscriptionExpiresAt
    ? new Date(restaurant.subscriptionExpiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const isExpired = restaurant?.subscriptionStatus === "expired" || (daysRemaining !== null && daysRemaining <= 0 && (restaurant?.customerLimit ?? 0) > 0);

  const unread = notifications.filter((n) => !n.isRead).length;

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-medium">{loadError}</p>
            <p className="text-sm text-red-500 mt-1">
              Your restaurant account could not be found. Please contact support.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Subscription</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your plan and recharge customer quota</p>
        </div>

        {/* Usage card */}
        {restaurant && (
          <div className={cn(
            "rounded-xl border-2 p-5",
            restaurant.subscriptionStatus === "exhausted" ? "border-red-300 bg-red-50" :
            restaurant.subscriptionStatus === "suspended" ? "border-gray-300 bg-gray-50" :
            isExpired ? "border-red-300 bg-red-50" :
            restaurant.customerLimit === 0 ? "border-yellow-300 bg-yellow-50" :
            usedPct >= 80 ? "border-orange-300 bg-orange-50" : "border-green-200 bg-green-50"
          )}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <span className="font-semibold">Customer Quota</span>
              </div>
              <span className={cn(
                "text-xs font-bold px-2 py-0.5 rounded-full uppercase",
                restaurant.subscriptionStatus === "active" && !isExpired ? "bg-green-100 text-green-700" :
                restaurant.subscriptionStatus === "exhausted" ? "bg-red-100 text-red-600" :
                isExpired ? "bg-red-100 text-red-600" :
                "bg-gray-100 text-gray-600"
              )}>
                {isExpired ? "expired" : restaurant.subscriptionStatus}
              </span>
            </div>

            {restaurant.customerLimit === 0 ? (
              <p className="text-sm text-yellow-700 font-medium flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                No active plan. Subscribe below to start accepting orders.
              </p>
            ) : (
              <>
                <div className="flex items-end justify-between mb-1">
                  <span className="text-3xl font-bold">{restaurant.customersUsed.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground">
                    / {isUnlimited ? "Unlimited" : restaurant.customerLimit.toLocaleString()} customers
                  </span>
                </div>
                {isUnlimited ? (
                  <div className="w-full bg-white/70 rounded-full h-2.5 mb-2">
                    <div className="h-2.5 rounded-full bg-green-500 w-full opacity-30" />
                  </div>
                ) : (
                  <div className="w-full bg-white/70 rounded-full h-2.5 mb-2">
                    <div
                      className={cn("h-2.5 rounded-full transition-all", usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-orange-500" : "bg-green-500")}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-xs text-muted-foreground">
                    {isUnlimited ? "Unlimited quota — no usage cap" : `${usedPct}% used${usedPct >= 80 ? " — consider recharging soon" : ""}`}
                  </p>
                  {expiryDateLabel && (
                    <p className={cn("text-xs font-medium", isExpired ? "text-red-600" : (daysRemaining !== null && daysRemaining <= 5) ? "text-red-600" : (daysRemaining !== null && daysRemaining <= 10) ? "text-orange-500" : "text-slate-500")}>
                      {isExpired
                        ? `Expired on ${expiryDateLabel}`
                        : daysRemaining === 0
                          ? "Expires today"
                          : daysRemaining === 1
                            ? `1 day left · ${expiryDateLabel}`
                            : `${daysRemaining} days left · Valid till ${expiryDateLabel}`}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
          {([
            { key: "plans", label: "Plans & Recharge" },
            { key: "history", label: "Payment History" },
            { key: "notifications", label: `Notifications${unread > 0 ? ` (${unread})` : ""}` },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                tab === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Plans */}
        {tab === "plans" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {plans.map((plan, i) => {
              const Icon = PLAN_ICONS[i % PLAN_ICONS.length];
              const isCurrent = restaurant?.planId === plan.id;
              return (
                <div key={plan.id} className={cn("rounded-xl border-2 bg-gradient-to-br p-5", PLAN_GRADIENTS[i % PLAN_GRADIENTS.length], isCurrent && "ring-2 ring-orange-400")}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5 text-orange-500" />
                      <span className="font-bold">{plan.name}</span>
                    </div>
                    {isCurrent && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Current</span>}
                  </div>
                  <p className="text-3xl font-bold mb-1">₹{Number(plan.price).toLocaleString("en-IN")}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                    <Users className="w-3.5 h-3.5" />
                    {plan.customerLimit >= 999999 ? "Unlimited" : plan.customerLimit.toLocaleString()} customers
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                    <Clock className="w-3.5 h-3.5" />
                    {plan.validityValue} {plan.validityType === "months" ? (plan.validityValue === 1 ? "month" : "months") : (plan.validityValue === 1 ? "day" : "days")} validity
                  </p>
                  {plan.description && <p className="text-xs text-muted-foreground mb-4">{plan.description}</p>}
                  <Button
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    size="sm"
                    disabled={paying === plan.id}
                    onClick={() => handleSubscribe(plan, "razorpay")}
                  >
                    {paying === plan.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    {isCurrent ? "Recharge" : "Subscribe"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Transaction history */}
        {tab === "history" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Payment History</h3>
            </div>
            {transactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <IndianRupee className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No transactions yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {transactions.map((txn) => (
                  <div key={txn.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{txn.planName ?? `Plan #${txn.planId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(txn.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                        {txn.paymentMethod === "razorpay" ? "Razorpay" : "UPI"}
                      </p>
                      {txn.razorpayPaymentId && (
                        <p className="text-xs text-muted-foreground font-mono">{txn.razorpayPaymentId}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">₹{Number(txn.amount).toLocaleString("en-IN")}</p>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", txn.status === "paid" ? "bg-green-100 text-green-700" : txn.status === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600")}>
                        {txn.status}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">+{txn.customersAdded === 999999 ? "∞" : txn.customersAdded.toLocaleString()} customers</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notifications */}
        {tab === "notifications" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold">Notifications</h3>
              {unread > 0 && <span className="text-xs text-muted-foreground">{unread} unread</span>}
            </div>
            {notifications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BellOff className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((n) => (
                  <div key={n.id} className={cn("px-4 py-3 flex items-start gap-3", !n.isRead && "bg-blue-50/50")}>
                    <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", !n.isRead ? "bg-blue-500" : "bg-transparent")} />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(n.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {!n.isRead && (
                      <button onClick={() => markRead(n.id)} className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0">
                        Mark read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── UPI Payment Modal ─────────────────────────────────────────────────── */}
      {upiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {upiSuccess ? (
              /* Under Review state — plan activates after admin verifies the UTR */
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-9 h-9 text-amber-600" />
                </div>
                <h2 className="text-xl font-bold mb-1">Payment Under Review</h2>
                <p className="text-sm text-muted-foreground mb-1">
                  Your UTR reference for the{" "}
                  <span className="font-semibold text-foreground">{upiModal.planName}</span> plan has been received.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 my-4 text-left space-y-1">
                  <p className="text-xs font-semibold text-amber-800">What happens next?</p>
                  <p className="text-xs text-amber-700">Our team will verify your payment against bank records and activate your plan within <span className="font-semibold">24 hours</span>.</p>
                  <p className="text-xs text-amber-700">You'll receive a notification here once it's confirmed.</p>
                </div>
                <p className="text-xs text-muted-foreground mb-5">
                  UTR: <span className="font-mono font-semibold">{utrRef.trim().toUpperCase()}</span>
                </p>
                <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={closeUpiModal}>
                  Got it
                </Button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-orange-500" />
                    <h2 className="font-bold text-base">Complete UPI Payment</h2>
                  </div>
                  <button
                    onClick={closeUpiModal}
                    className="p-1 rounded-md hover:bg-muted transition-colors"
                    disabled={confirmingUpi}
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  {/* Plan summary */}
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-orange-600 font-medium uppercase tracking-wide">Plan Selected</p>
                      <p className="font-bold text-foreground">{upiModal.planName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Users className="w-3 h-3" />
                        {upiModal.customersAdded === 999999 ? "Unlimited" : upiModal.customersAdded.toLocaleString()} customers
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Amount to pay</p>
                      <p className="text-2xl font-bold text-orange-600">
                        ₹{Number(upiModal.amount).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>

                  {/* Step 1: UPI ID */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                      <p className="text-sm font-semibold">Send payment to this UPI ID</p>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                      <CreditCard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 font-mono text-sm font-semibold text-foreground">{upiModal.upiId}</span>
                      <button
                        onClick={() => copyUpiId(upiModal.upiId)}
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors",
                          copied ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                        )}
                      >
                        {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 pl-7">
                      Open any UPI app (PhonePe, GPay, Paytm, BHIM) and send exactly{" "}
                      <span className="font-semibold text-foreground">₹{Number(upiModal.amount).toLocaleString("en-IN")}</span>
                    </p>
                  </div>

                  {/* Step 2: UTR */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                      <p className="text-sm font-semibold">Enter UTR / Transaction Reference</p>
                    </div>
                    <input
                      type="text"
                      value={utrRef}
                      onChange={(e) => { setUtrRef(e.target.value); setUtrError(""); }}
                      placeholder="e.g. 506812345678"
                      className={cn(
                        "w-full border rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors",
                        utrError ? "border-red-400 bg-red-50" : "border-gray-200 bg-white"
                      )}
                      disabled={confirmingUpi}
                    />
                    {utrError && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1 pl-1">
                        <AlertTriangle className="w-3 h-3" /> {utrError}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5 pl-1">
                      Find the 12-digit UTR in your UPI app under payment history after the transfer.
                    </p>
                  </div>

                  {/* Confirm button */}
                  <Button
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white h-11"
                    onClick={handleUpiConfirm}
                    disabled={confirmingUpi}
                  >
                    {confirmingUpi ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Confirming Payment…</>
                    ) : (
                      <><Check className="w-4 h-4 mr-2" /> I've Paid — Confirm & Activate</>
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Your plan activates instantly once the UTR is submitted.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
