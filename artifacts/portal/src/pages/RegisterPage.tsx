import { useState, useEffect, useMemo } from "react";
import { STATE_NAMES, getDistricts } from "@/data/india-states-districts";
import { Link, useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SubscriptionPlan } from "@/lib/types";
import {
  Loader2, CheckCircle2, QrCode, Smartphone, BarChart3,
  ArrowRight, ArrowLeft, Users, IndianRupee, Zap, Crown, Star, Check,
  Copy, ExternalLink, AlertCircle, CreditCard, Landmark,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open(): void };
  }
}

const CUISINE_TYPES = [
  { value: "north_indian", label: "North Indian" },
  { value: "south_indian", label: "South Indian" },
  { value: "chinese", label: "Chinese" },
  { value: "continental", label: "Continental" },
  { value: "italian", label: "Italian" },
  { value: "mughlai", label: "Mughlai" },
  { value: "seafood", label: "Seafood" },
  { value: "street_food", label: "Street Food" },
  { value: "multi_cuisine", label: "Multi Cuisine" },
  { value: "other", label: "Other" },
];

const PLAN_ICONS = [Zap, Star, Crown, IndianRupee];
const PLAN_COLORS = [
  "border-slate-200 hover:border-orange-300",
  "border-blue-200 hover:border-blue-400",
  "border-purple-200 hover:border-purple-400",
  "border-amber-200 hover:border-amber-400",
];
const PLAN_SELECTED_COLORS = [
  "border-orange-500 bg-orange-50",
  "border-blue-500 bg-blue-50",
  "border-purple-500 bg-purple-50",
  "border-amber-500 bg-amber-50",
];

type Step = 1 | 2 | 3;
// Sub-state within step 2
type PaymentView = "select-plan" | "upi-instructions" | "razorpay-loading";

// Demo UPI details — replace with real business UPI in production
const UPI_ID = "bitebend@upi";
const BANK_NAME = "HDFC Bank";
const ACCOUNT_NAME = "Bitebend Technologies Pvt Ltd";
const IFSC = "HDFC0001234";
const ACCOUNT_NO = "50200012345678";

export default function RegisterPage() {
  const { refresh } = useAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [paymentView, setPaymentView] = useState<PaymentView>("select-plan");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [paymentDone, setPaymentDone] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"razorpay" | "upi">("razorpay");
  const [copied, setCopied] = useState<string | null>(null);
  const [step1Submitted, setStep1Submitted] = useState(false);

  const [razorpayMeta, setRazorpayMeta] = useState<{
    razorpayPaymentId: string;
    razorpayOrderId: string;
    razorpaySignature: string;
  } | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    restaurantName: "",
    restaurantPhone: "",
    restaurantAddress: "",
    restaurantCity: "",
    restaurantState: "",
    restaurantDistrict: "",
    cuisineType: "multi_cuisine",
  });

  const districts = useMemo(() => getDistricts(form.restaurantState), [form.restaurantState]);

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((f) => ({ ...f, restaurantState: e.target.value, restaurantDistrict: "" }));
  };

  useEffect(() => {
    apiFetch<SubscriptionPlan[]>("/subscription/plans").then(setPlans).catch(() => {});
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const step1Valid =
    form.name && form.email && form.password.length >= 6 &&
    form.restaurantName && form.restaurantPhone && form.restaurantAddress &&
    form.restaurantCity && form.restaurantState && form.restaurantDistrict;

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const loadRazorpay = () =>
    new Promise<void>((resolve) => {
      if (window.Razorpay) { resolve(); return; }
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve();
      s.onerror = () => resolve(); // resolve even on error; we'll check window.Razorpay
      document.body.appendChild(s);
    });

  // ── Called when user clicks "Pay via Razorpay"
  const handleRazorpayPay = async () => {
    if (!selectedPlan) return;
    setError("");
    setLoading(true);
    setPaymentView("razorpay-loading");
    try {
      const orderRes = await apiFetch<{
        razorpayOrderId: string | null;
        keyId: string | null;
        amount: number;
        planName: string;
      }>("/auth/registration-order", {
        method: "POST",
        body: JSON.stringify({ planId: selectedPlan.id }),
      });

      if (!orderRes.razorpayOrderId || !orderRes.keyId) {
        // Razorpay not configured — stay on plan selection, show a clear message
        setError("Card / Net Banking payment is not yet enabled. Please use UPI or bank transfer to complete your payment.");
        setPaymentView("select-plan");
        setLoading(false);
        return;
      }

      await loadRazorpay();

      if (!window.Razorpay) {
        setError("Could not load payment gateway. Please use UPI transfer instead.");
        setPaymentView("upi-instructions");
        setPaymentMethod("upi");
        setLoading(false);
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: orderRes.keyId,
          amount: Math.round(orderRes.amount * 100), // Razorpay requires paise; orderRes.amount is in rupees
          currency: "INR",
          name: "Bitebend",
          description: `${orderRes.planName} Plan`,
          order_id: orderRes.razorpayOrderId,
          prefill: {
            name: form.name,
            email: form.email,
            contact: form.restaurantPhone,
          },
          theme: { color: "#f97316" },
          handler: (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            setRazorpayMeta({
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            });
            setPaymentDone(true);
            setStep(3);
            resolve();
          },
          modal: {
            ondismiss: () => {
              setPaymentView("select-plan");
              reject(new Error("Payment cancelled"));
            },
          },
        });
        rzp.open();
      });
    } catch (err) {
      if (err instanceof Error && err.message !== "Payment cancelled") {
        setError(err.message);
        setPaymentView("select-plan");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Called when user clicks "Pay via UPI"
  const handleUpiPay = () => {
    if (!selectedPlan) return;
    setPaymentMethod("upi");
    setPaymentView("upi-instructions");
  };

  // ── Called after user confirms UPI payment done
  const handleUpiConfirmed = () => {
    setPaymentDone(true);
    setStep(3);
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          planId: selectedPlan?.id ?? undefined,
          ...(razorpayMeta ?? {}),
        }),
      });
      await refresh();
      navigate("/restaurant/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const upiAmount = selectedPlan ? Number(selectedPlan.price).toLocaleString("en-IN") : "";
  const upiDeepLink = selectedPlan
    ? `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(ACCOUNT_NAME)}&am=${selectedPlan.price}&cu=INR&tn=${encodeURIComponent(`Bitebend ${selectedPlan.name} Plan`)}`
    : "#";

  const steps = [
    { n: 1, label: "Account & Restaurant" },
    { n: 2, label: "Choose Plan" },
    { n: 3, label: "Confirm" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[40%] bg-gradient-to-br from-orange-500 to-amber-500 p-12 flex-col justify-between text-white">
        <div className="flex items-center">
          <img src={logo} alt="Bitebend" className="w-44 h-auto object-contain" style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.45))" }} />
        </div>
        <div>
          <h2 className="text-4xl font-bold mb-4 leading-tight">
            Grow your restaurant with QR ordering
          </h2>
          <p className="text-orange-100 text-lg mb-10">
            Pay once, serve thousands. No commissions, no hidden fees.
          </p>
          <div className="space-y-5">
            {[
              { icon: QrCode, title: "QR-based Ordering", desc: "Customers scan and order in seconds — no app needed" },
              { icon: Smartphone, title: "WhatsApp Billing", desc: "Send itemized bills directly to customers" },
              { icon: BarChart3, title: "Live Dashboard", desc: "Track orders and revenue in real-time" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-orange-100 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-orange-100 text-sm">Trusted by restaurants across India</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
        <div className="w-full max-w-xl py-8">
          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-6">
            <img src={logo} alt="Bitebend" className="w-44 h-auto object-contain mx-auto" />
          </div>

          {/* Step indicator */}
          <div className="flex items-center mb-8">
            {steps.map((s, i) => (
              <div key={s.n} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                    step > s.n
                      ? "bg-orange-500 text-white"
                      : step === s.n
                      ? "bg-orange-500 text-white ring-4 ring-orange-100"
                      : "bg-white border-2 border-slate-200 text-slate-400"
                  )}>
                    {step > s.n ? <Check className="w-4 h-4" /> : s.n}
                  </div>
                  <span className={cn(
                    "text-xs font-medium hidden sm:block",
                    step === s.n ? "text-orange-600" : "text-slate-400"
                  )}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={cn(
                    "flex-1 h-0.5 mx-2",
                    step > s.n ? "bg-orange-400" : "bg-slate-200"
                  )} />
                )}
              </div>
            ))}
          </div>

          {/* ── STEP 1: Account + Restaurant ── */}
          {step === 1 && (
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold mb-1">Create your account</h2>
              <p className="text-slate-500 text-sm mb-6">Tell us about you and your restaurant</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label>Your Name <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="Rahul Sharma"
                      value={form.name}
                      onChange={set("name")}
                      className={cn(step1Submitted && !form.name && "border-red-400 focus-visible:ring-red-300")}
                    />
                    {step1Submitted && !form.name && <p className="text-xs text-red-500">Name is required</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email <span className="text-red-500">*</span></Label>
                    <Input
                      type="email"
                      placeholder="you@restaurant.com"
                      value={form.email}
                      onChange={set("email")}
                      className={cn(step1Submitted && !form.email && "border-red-400 focus-visible:ring-red-300")}
                    />
                    {step1Submitted && !form.email && <p className="text-xs text-red-500">Email is required</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Password <span className="text-red-500">*</span></Label>
                    <Input
                      type="password"
                      placeholder="Min 6 characters"
                      value={form.password}
                      onChange={set("password")}
                      className={cn(step1Submitted && form.password.length < 6 && "border-red-400 focus-visible:ring-red-300")}
                    />
                    {step1Submitted && form.password.length < 6 && (
                      <p className="text-xs text-red-500">{form.password.length === 0 ? "Password is required" : "Min 6 characters"}</p>
                    )}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Restaurant Details</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Restaurant Name <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="e.g. Spice Garden"
                        value={form.restaurantName}
                        onChange={set("restaurantName")}
                        className={cn(step1Submitted && !form.restaurantName && "border-red-400 focus-visible:ring-red-300")}
                      />
                      {step1Submitted && !form.restaurantName && <p className="text-xs text-red-500">Restaurant name is required</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone <span className="text-red-500">*</span></Label>
                      <Input
                        type="tel"
                        placeholder="98765 43210"
                        value={form.restaurantPhone}
                        onChange={set("restaurantPhone")}
                        className={cn(step1Submitted && !form.restaurantPhone && "border-red-400 focus-visible:ring-red-300")}
                      />
                      {step1Submitted && !form.restaurantPhone && <p className="text-xs text-red-500">Phone is required</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>State <span className="text-red-500">*</span></Label>
                        <select
                          className={cn(
                            "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            step1Submitted && !form.restaurantState ? "border-red-400 focus-visible:ring-red-300" : "border-input"
                          )}
                          value={form.restaurantState}
                          onChange={handleStateChange}
                        >
                          <option value="">Select state…</option>
                          {STATE_NAMES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        {step1Submitted && !form.restaurantState && <p className="text-xs text-red-500">State is required</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label>District <span className="text-red-500">*</span></Label>
                        <select
                          className={cn(
                            "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            step1Submitted && !form.restaurantDistrict ? "border-red-400 focus-visible:ring-red-300" : "border-input",
                            !form.restaurantState && "opacity-50 cursor-not-allowed"
                          )}
                          value={form.restaurantDistrict}
                          onChange={set("restaurantDistrict")}
                          disabled={!form.restaurantState}
                        >
                          <option value="">{form.restaurantState ? "Select district…" : "Select state first"}</option>
                          {districts.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        {step1Submitted && !form.restaurantDistrict && <p className="text-xs text-red-500">District is required</p>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>City <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="e.g. Mumbai, Pune, Ahmedabad"
                        value={form.restaurantCity}
                        onChange={set("restaurantCity")}
                        className={cn(step1Submitted && !form.restaurantCity && "border-red-400 focus-visible:ring-red-300")}
                      />
                      {step1Submitted && !form.restaurantCity && <p className="text-xs text-red-500">City is required</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Address <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="123 MG Road"
                        value={form.restaurantAddress}
                        onChange={set("restaurantAddress")}
                        className={cn(step1Submitted && !form.restaurantAddress && "border-red-400 focus-visible:ring-red-300")}
                      />
                      {step1Submitted && !form.restaurantAddress && <p className="text-xs text-red-500">Address is required</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cuisine Type</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={form.cuisineType}
                        onChange={set("cuisineType")}
                      >
                        {CUISINE_TYPES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white h-11"
                  onClick={() => {
                    setStep1Submitted(true);
                    if (step1Valid) {
                      setStep(2);
                      setPaymentView("select-plan");
                    }
                  }}
                >
                  Next: Choose Plan <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
              <p className="text-center text-sm text-slate-500 mt-5">
                Already registered?{" "}
                <Link href="/restaurant/auth" className="text-orange-500 font-medium hover:underline">Sign in</Link>
              </p>
            </div>
          )}

          {/* ── STEP 2: Choose Plan ── */}
          {step === 2 && (
            <div className="space-y-4">

              {/* 2A: Plan selection + method choice */}
              {paymentView === "select-plan" && (
                <div className="bg-white rounded-2xl shadow-xl p-8">
                  <h2 className="text-2xl font-bold mb-1">Choose a plan</h2>
                  <p className="text-slate-500 text-sm mb-6">
                    Pay based on how many customers you serve. Recharge anytime when you run out.
                  </p>

                  {plans.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                      {plans.map((plan, i) => {
                        const Icon = PLAN_ICONS[i % PLAN_ICONS.length];
                        const selected = selectedPlan?.id === plan.id;
                        return (
                          <button
                            key={plan.id}
                            onClick={() => setSelectedPlan(plan)}
                            className={cn(
                              "text-left p-4 rounded-xl border-2 transition-all",
                              selected
                                ? PLAN_SELECTED_COLORS[i % PLAN_SELECTED_COLORS.length]
                                : PLAN_COLORS[i % PLAN_COLORS.length]
                            )}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4 text-orange-500" />
                                <span className="font-bold text-sm">{plan.name}</span>
                              </div>
                              {selected && <Check className="w-4 h-4 text-orange-500" />}
                            </div>
                            <p className="text-2xl font-bold mb-0.5">
                              ₹{Number(plan.price).toLocaleString("en-IN")}
                            </p>
                            <p className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                              <Users className="w-3 h-3" />
                              {plan.customerLimit === 999999 ? "Unlimited" : plan.customerLimit.toLocaleString()} customers
                            </p>
                            {plan.description && (
                              <p className="text-xs text-slate-400">{plan.description}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedPlan && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        How would you like to pay?
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Razorpay button */}
                        <button
                          onClick={handleRazorpayPay}
                          disabled={loading}
                          className="flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 transition-all group"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
                            <CreditCard className="w-5 h-5 text-white" />
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-sm">Card / Net Banking</p>
                            <p className="text-xs text-slate-400">Pay instantly via Razorpay</p>
                          </div>
                          {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                          ) : (
                            <span className="text-xs font-bold text-orange-600 group-hover:underline">
                              ₹{Number(selectedPlan.price).toLocaleString("en-IN")} →
                            </span>
                          )}
                        </button>

                        {/* UPI button */}
                        <button
                          onClick={handleUpiPay}
                          className="flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 border-slate-200 hover:border-green-400 hover:bg-green-50 transition-all group"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                            <Smartphone className="w-5 h-5 text-white" />
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-sm">UPI / Bank Transfer</p>
                            <p className="text-xs text-slate-400">GPay, PhonePe, NEFT</p>
                          </div>
                          <span className="text-xs font-bold text-green-600 group-hover:underline">
                            ₹{Number(selectedPlan.price).toLocaleString("en-IN")} →
                          </span>
                        </button>
                      </div>

                      {error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          {error}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    className="mt-5 w-full text-center text-xs text-slate-400 hover:text-slate-600"
                    onClick={() => { setSelectedPlan(null); setStep(3); }}
                  >
                    Skip payment — set up menu first, subscribe later to go live
                  </button>
                </div>
              )}

              {/* 2B: Razorpay loading state */}
              {paymentView === "razorpay-loading" && (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center">
                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Opening payment gateway…</h3>
                  <p className="text-slate-500 text-sm">
                    Please wait while we connect to Razorpay. The payment window will open shortly.
                  </p>
                  <button
                    className="mt-6 text-xs text-slate-400 hover:text-slate-600"
                    onClick={() => { setPaymentView("select-plan"); setLoading(false); }}
                  >
                    Cancel and go back
                  </button>
                </div>
              )}

              {/* 2C: UPI payment instructions */}
              {paymentView === "upi-instructions" && selectedPlan && (
                <div className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">Pay via UPI / Bank Transfer</h2>
                    <p className="text-slate-500 text-sm">
                      Transfer <span className="font-bold text-slate-800">
                        ₹{Number(selectedPlan.price).toLocaleString("en-IN")}
                      </span> to complete your <span className="font-semibold">{selectedPlan.name}</span> plan subscription.
                    </p>
                  </div>

                  {/* Amount banner */}
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-orange-500 font-semibold uppercase tracking-wide">Amount to Pay</p>
                      <p className="text-3xl font-bold text-orange-600">₹{upiAmount}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">{selectedPlan.name} Plan</p>
                      <p className="text-xs text-slate-400">{selectedPlan.customerLimit === 999999 ? "Unlimited" : selectedPlan.customerLimit.toLocaleString()} customers</p>
                    </div>
                  </div>

                  {/* UPI Option */}
                  <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
                        <Smartphone className="w-4 h-4 text-green-600" />
                      </div>
                      <p className="font-semibold text-sm">UPI Payment</p>
                      <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Recommended</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5">
                      <div>
                        <p className="text-xs text-slate-400">UPI ID</p>
                        <p className="font-mono font-semibold text-sm">{UPI_ID}</p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(UPI_ID, "upi")}
                        className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-700 font-medium"
                      >
                        {copied === "upi" ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                      </button>
                    </div>

                    <button
                      onClick={() => { window.location.href = upiDeepLink; }}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in GPay / PhonePe / Paytm
                    </button>
                    <p className="text-xs text-slate-400 text-center">
                      Works on mobile. On desktop, copy the UPI ID and pay manually from your app.
                    </p>
                  </div>

                  {/* Bank Transfer Option */}
                  <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Landmark className="w-4 h-4 text-blue-600" />
                      </div>
                      <p className="font-semibold text-sm">Bank Transfer / NEFT / RTGS</p>
                    </div>

                    {[
                      { label: "Bank Name", value: BANK_NAME, key: "bank" },
                      { label: "Account Name", value: ACCOUNT_NAME, key: "accname" },
                      { label: "Account Number", value: ACCOUNT_NO, key: "accno" },
                      { label: "IFSC Code", value: IFSC, key: "ifsc" },
                    ].map(({ label, value, key }) => (
                      <div key={key} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-xs text-slate-400">{label}</p>
                          <p className="font-mono text-sm font-medium">{value}</p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(value, key)}
                          className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-700 font-medium"
                        >
                          {copied === key ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Note */}
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                    <p>
                      After making the payment, click <strong>"I've Paid"</strong> below to continue. Our admin will verify and activate your plan within 2 hours.
                    </p>
                  </div>

                  <Button
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white h-11 text-base font-semibold"
                    onClick={handleUpiConfirmed}
                  >
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    I've Paid — Continue
                  </Button>
                </div>
              )}

              <button
                onClick={() => {
                  if (paymentView !== "select-plan") {
                    setPaymentView("select-plan");
                    setError("");
                  } else {
                    setStep(1);
                  }
                }}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            </div>
          )}

          {/* ── STEP 3: Confirm & Create Account ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <h2 className="text-2xl font-bold mb-1">Almost done!</h2>
                <p className="text-slate-500 text-sm mb-6">Review your details and create your account</p>

                <div className="bg-slate-50 rounded-xl p-4 space-y-2 mb-6 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Name</span>
                    <span className="font-medium">{form.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Email</span>
                    <span className="font-medium">{form.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Restaurant</span>
                    <span className="font-medium">{form.restaurantName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">City</span>
                    <span className="font-medium">{form.restaurantCity}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                    <span className="text-slate-500">Plan</span>
                    <span className={cn("font-semibold", selectedPlan ? "text-orange-600" : "text-slate-400")}>
                      {selectedPlan
                        ? `${selectedPlan.name} — ₹${Number(selectedPlan.price).toLocaleString("en-IN")}`
                        : "No plan — subscribe later"}
                    </span>
                  </div>
                  {selectedPlan && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Payment</span>
                      <span className={cn(
                        "font-medium text-xs",
                        razorpayMeta ? "text-green-600" : "text-yellow-600"
                      )}>
                        {razorpayMeta
                          ? `✓ Paid via Razorpay (${razorpayMeta.razorpayPaymentId})`
                          : "⏳ UPI transfer — pending admin confirmation"}
                      </span>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm mb-4">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white h-11 text-base font-semibold"
                  disabled={loading}
                  onClick={handleSubmit}
                >
                  {loading
                    ? <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    : <CheckCircle2 className="w-5 h-5 mr-2" />}
                  Create Account & Go Live
                </Button>
              </div>

              <button
                onClick={() => { setStep(2); setPaymentView("select-plan"); setError(""); }}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
