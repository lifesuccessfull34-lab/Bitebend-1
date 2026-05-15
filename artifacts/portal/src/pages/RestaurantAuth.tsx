import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATE_NAMES, getDistricts } from "@/data/india-states-districts";
import type { SubscriptionPlan } from "@/lib/types";
import {
  Loader2, LogIn, UserPlus, Eye, EyeOff,
  ChevronRight, AlertTriangle, CheckCircle2, KeyRound,
  ArrowLeft, Copy, Check, Smartphone, Users, IndianRupee,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

type Tab = "signin" | "register";

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

const FIELD = "flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-gray-600">{label}</Label>
      {children}
    </div>
  );
}

// ─── Sign In Tab ─────────────────────────────────────────────────────────────
function SignInForm() {
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const [view, setView] = useState<"signin" | "forgot" | "done">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [fpEmail, setFpEmail] = useState("");
  const [fpPhone, setFpPhone] = useState("");
  const [fpError, setFpError] = useState("");
  const [fpLoading, setFpLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.role === "super_admin") {
        setError("This portal is for restaurant owners only. Please use the Admin Login instead.");
        return;
      }
      navigate("/restaurant/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError("");
    setFpLoading(true);
    try {
      const res = await apiFetch<{ newPassword: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: fpEmail, phone: fpPhone }),
      });
      setNewPassword(res.newPassword);
      setView("done");
    } catch (err) {
      setFpError(err instanceof Error ? err.message : "Could not reset password. Please try again.");
    } finally {
      setFpLoading(false);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const goBackToSignIn = () => {
    setView("signin");
    if (fpEmail) setEmail(fpEmail);
    setPassword("");
    setFpEmail("");
    setFpPhone("");
    setFpError("");
    setNewPassword("");
    setCopied(false);
  };

  if (view === "forgot") {
    return (
      <form onSubmit={handleForgot} className="space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <button type="button" onClick={() => setView("signin")}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <p className="text-sm text-gray-500">Enter your registered email and phone to reset your password.</p>
        </div>
        <FieldRow label="Registered Email">
          <Input type="email" placeholder="you@restaurant.com" value={fpEmail}
            onChange={(e) => setFpEmail(e.target.value)} required autoComplete="email"
            className="focus-visible:ring-orange-400" />
        </FieldRow>
        <FieldRow label="Registered Phone Number">
          <div className="relative">
            <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input type="tel" placeholder="9876543210" value={fpPhone}
              onChange={(e) => setFpPhone(e.target.value)} required
              className="pl-9 focus-visible:ring-orange-400" />
          </div>
        </FieldRow>
        {fpError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{fpError}
          </div>
        )}
        <button type="submit" disabled={fpLoading}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm shadow-md shadow-orange-100 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
          {fpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><KeyRound className="w-4 h-4" /> Reset My Password</>}
        </button>
      </form>
    );
  }

  if (view === "done") {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center gap-2 py-2">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </div>
          <p className="font-bold text-gray-900">Password Reset!</p>
          <p className="text-sm text-gray-500">Use this temporary password to sign in, then change it from your profile.</p>
        </div>
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1.5">Your New Password</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-lg font-bold font-mono text-gray-900 tracking-widest">{newPassword}</code>
            <button type="button" onClick={copyPassword}
              className={cn("flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                copied ? "bg-green-100 text-green-700" : "bg-orange-200 text-orange-700 hover:bg-orange-300")}>
              {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </button>
          </div>
        </div>
        <button type="button" onClick={goBackToSignIn}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm shadow-md shadow-orange-100 transition-all flex items-center justify-center gap-2">
          <LogIn className="w-4 h-4" /> Sign In with New Password
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      <FieldRow label="Email">
        <Input type="email" placeholder="you@restaurant.com" value={email}
          onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
          className="focus-visible:ring-orange-400" />
      </FieldRow>
      <FieldRow label="Password">
        <div className="relative">
          <Input type={showPw ? "text" : "password"} placeholder="••••••••" value={password}
            onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
            className="pr-10 focus-visible:ring-orange-400" />
          <button type="button" onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex justify-end mt-1">
          <button type="button" onClick={() => { setView("forgot"); setFpEmail(email); setFpError(""); }}
            className="text-xs text-orange-500 hover:text-orange-700 font-semibold hover:underline">
            Forgot password?
          </button>
        </div>
      </FieldRow>
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}
      <button type="submit" disabled={loading}
        className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm shadow-md shadow-orange-100 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LogIn className="w-4 h-4" /> Sign In to Dashboard</>}
      </button>
    </form>
  );
}

// ─── Register Tab ─────────────────────────────────────────────────────────────
const emptyForm = () => ({
  restaurantName: "", ownerName: "", email: "", phone: "",
  password: "", confirmPassword: "", cuisineType: "", state: "", city: "", address: "",
});

function RegisterForm() {
  const { refresh } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState(emptyForm());
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const districts = form.state ? getDistricts(form.state) : [];
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!termsAccepted) { setError("You must accept Terms & Conditions and Privacy Policy"); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
    if (form.password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (!form.city.trim()) { setError("Please enter your city or district."); return; }
    setLoading(true);
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.ownerName,
          email: form.email,
          password: form.password,
          restaurantName: form.restaurantName,
          restaurantPhone: form.phone,
          restaurantCity: form.city,
          restaurantState: form.state || undefined,
          restaurantAddress: form.address || undefined,
          cuisineType: form.cuisineType || "other",
          termsAccepted: true,
          privacyAccepted: true,
        }),
      });
      setDone(true);
      await refresh();
      setTimeout(() => navigate("/restaurant/dashboard"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <p className="font-bold text-gray-800">Account Created!</p>
        <p className="text-sm text-gray-500">Redirecting to your dashboard…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Restaurant Name *">
          <Input placeholder="Spice Garden" value={form.restaurantName} onChange={set("restaurantName")} required className="focus-visible:ring-orange-400" />
        </FieldRow>
        <FieldRow label="Owner Name *">
          <Input placeholder="Rahul Sharma" value={form.ownerName} onChange={set("ownerName")} required className="focus-visible:ring-orange-400" />
        </FieldRow>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Email *">
          <Input type="email" placeholder="you@restaurant.com" value={form.email} onChange={set("email")} required autoComplete="email" className="focus-visible:ring-orange-400" />
        </FieldRow>
        <FieldRow label="Phone *">
          <Input placeholder="9876543210" value={form.phone} onChange={set("phone")} required className="focus-visible:ring-orange-400" />
        </FieldRow>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Password *">
          <div className="relative">
            <Input type={showPw ? "text" : "password"} placeholder="Min. 6 characters"
              value={form.password} onChange={set("password")} required className="pr-9 focus-visible:ring-orange-400" />
            <button type="button" onClick={() => setShowPw((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </FieldRow>
        <FieldRow label="Confirm Password *">
          <div className="relative">
            <Input type={showConfirmPw ? "text" : "password"} placeholder="Repeat password"
              value={form.confirmPassword} onChange={set("confirmPassword")} required
              className="pr-9 focus-visible:ring-orange-400" />
            <button type="button" onClick={() => setShowConfirmPw((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showConfirmPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </FieldRow>
      </div>
      <FieldRow label="Cuisine Type">
        <select value={form.cuisineType} onChange={set("cuisineType")} className={FIELD}>
          <option value="">Select cuisine…</option>
          {CUISINE_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </FieldRow>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="State">
          <select value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value, city: "" }))} className={FIELD}>
            <option value="">Select state…</option>
            {STATE_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="City *">
          {districts.length > 0 ? (
            <select value={form.city} onChange={set("city")} className={FIELD} required>
              <option value="">Select city…</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          ) : (
            <Input placeholder="City / District" value={form.city} onChange={set("city")} required className="focus-visible:ring-orange-400" />
          )}
        </FieldRow>
      </div>
      <FieldRow label="Restaurant Address (optional)">
        <Input placeholder="123, MG Road, Near City Mall…" value={form.address}
          onChange={set("address")} className="focus-visible:ring-orange-400" />
      </FieldRow>
      {/* Terms & Privacy checkbox */}
      <label className="flex items-start gap-2.5 cursor-pointer group">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => { setTermsAccepted(e.target.checked); if (e.target.checked) setError(""); }}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-500 accent-orange-500 cursor-pointer shrink-0"
        />
        <span className="text-xs text-gray-500 leading-relaxed">
          I agree to the{" "}
          <a href="/portal/terms" target="_blank" rel="noreferrer"
            className="text-orange-600 font-semibold hover:underline">
            Terms &amp; Conditions
          </a>
          {" "}and{" "}
          <a href="/portal/privacy-policy" target="_blank" rel="noreferrer"
            className="text-orange-600 font-semibold hover:underline">
            Privacy Policy
          </a>
        </span>
      </label>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}
      <p className="text-xs text-gray-400">You can choose a subscription plan from your dashboard after creating your account.</p>
      <button type="submit" disabled={loading || !termsAccepted}
        className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm shadow-md shadow-orange-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" />
          : <><UserPlus className="w-4 h-4" /> Create Account &amp; Go Live <ChevronRight className="w-4 h-4" /></>}
      </button>
    </form>
  );
}

// ─── Left Panel — fetches real plans ─────────────────────────────────────────
function LeftPanel() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [imgLoaded, setImgLoaded] = useState(true);

  useEffect(() => {
    apiFetch<SubscriptionPlan[]>("/subscription/plans")
      .then(setPlans)
      .catch(() => { /* silent — show nothing if offline */ });
  }, []);

  const cheapest = plans.find((p) => p.customerLimit !== 999999);
  const planPrice = cheapest ? `From ₹${(cheapest.price / 100).toLocaleString("en-IN")}` : "Flexible pricing";
  const planDesc = cheapest
    ? `${planPrice} for ${cheapest.customerLimit.toLocaleString()} customers`
    : "Usage-based plans starting at ₹199";

  return (
    <div className="hidden lg:flex lg:w-5/12 flex-col bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 relative overflow-hidden">
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/3 pointer-events-none" />
      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logo} alt="Bitebend" className="w-52 h-auto object-contain mx-auto mb-2" style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.45))" }} />
          <p className="text-white/80 text-sm font-medium tracking-wide">Restaurant Management Portal</p>
        </div>

        {/* Feature cards */}
        <div className="space-y-3 flex-1">
          {[
            { icon: "🍽️", title: "Digital Menu", body: "QR-based ordering — no app needed for customers" },
            { icon: "📊", title: "Live Dashboard", body: "Track orders, revenue, and analytics in real time" },
            { icon: "🏷️", title: "Flexible Plans", body: planDesc },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-3.5 border border-white/20">
              <span className="text-2xl leading-none mt-0.5">{f.icon}</span>
              <div>
                <p className="font-bold text-white text-sm">{f.title}</p>
                <p className="text-white/75 text-xs mt-0.5">{f.body}</p>
              </div>
            </div>
          ))}

        </div>

        {/* Hero restaurant photo */}
        {imgLoaded && (
          <div className="mt-5 rounded-2xl overflow-hidden border border-white/25 shadow-2xl flex-shrink-0" style={{ height: 180 }}>
            <div className="relative w-full h-full">
              <img
                src="/portal/restaurant-hero.png"
                alt="Restaurant dining experience with QR ordering"
                className="w-full h-full object-cover"
                onError={() => setImgLoaded(false)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <span className="text-white text-xs font-semibold drop-shadow">QR ordering — scan, browse, order</span>
                <span className="text-white/80 text-xs">🇮🇳</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RestaurantAuth() {
  const [tab, setTab] = useState<Tab>("signin");

  return (
    <div className="min-h-screen flex">
      <LeftPanel />

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-orange-50 p-6 overflow-y-auto">
        {/* Mobile logo */}
        <div className="lg:hidden text-center mb-6">
          <img src={logo} alt="Bitebend" className="w-44 h-auto object-contain mx-auto mb-1" />
          <p className="text-xs text-gray-500">Restaurant Management Portal</p>
        </div>

        <div className="w-full max-w-lg">
          <div className="bg-white rounded-3xl shadow-2xl border border-orange-100 overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500" />
            <div className="p-7">
              {/* Tab switcher */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
                {([
                  { key: "signin" as Tab, label: "Sign In", icon: LogIn },
                  { key: "register" as Tab, label: "Register", icon: UserPlus },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={cn("flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all",
                      tab === key ? "bg-white text-orange-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
              </div>

              {/* Tab heading */}
              <div className="mb-5">
                {tab === "signin" ? (
                  <>
                    <h2 className="text-xl font-bold text-gray-900">Welcome back</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Sign in to your restaurant account</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-gray-900">Create your restaurant</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Set up your account in under a minute</p>
                  </>
                )}
              </div>

              {tab === "signin" ? <SignInForm /> : <RegisterForm />}

              {/* Toggle hint */}
              <p className="text-center text-xs text-gray-400 mt-5">
                {tab === "signin" ? (
                  <>New to Bitebend?{" "}
                    <button onClick={() => setTab("register")} className="text-orange-500 font-semibold hover:underline">
                      Create an account
                    </button>
                  </>
                ) : (
                  <>Already have an account?{" "}
                    <button onClick={() => setTab("signin")} className="text-orange-500 font-semibold hover:underline">
                      Sign in
                    </button>
                  </>
                )}
              </p>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
