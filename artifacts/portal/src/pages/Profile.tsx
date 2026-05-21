import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { Restaurant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, CheckCircle2, Eye, EyeOff, ExternalLink, KeyRound, Smartphone, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";

// Builds a minimal ₹1 UPI test link — same format as the customer checkout.
// Only mandatory fields (pa, pn, am, cu) so no optional field can be the cause
// of a payment-app rejection during diagnosis.
function buildTestUpiLink(upiId: string, name: string): string {
  const pa = upiId.trim();
  const pn = encodeURIComponent(
    name.replace(/[#?&=%:;/\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 50),
  );
  return `upi://pay?pa=${pa}&pn=${pn}&am=1.00&cu=INR`;
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

export default function Profile() {
  const { user, refresh: refreshAuth } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    cuisineType: "multi_cuisine",
    address: "",
    city: "",
    phone: "",
    email: "",
    upiId: "",
    upiName: "",
    personalUpiEnabled: false,
    whatsappNumber: "",
    taxPercent: "5",
    razorpayKeyId: "",
    razorpayKeySecret: "",
  });

  // Login credentials state
  const [credForm, setCredForm] = useState({
    currentPassword: "",
    newEmail: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCredPasswords, setShowCredPasswords] = useState({ current: false, new: false, confirm: false });
  const [credSaving, setCredSaving] = useState(false);
  const [credSaved, setCredSaved] = useState(false);
  const [credError, setCredError] = useState("");

  useEffect(() => {
    apiFetch<Restaurant>("/owner/restaurant")
      .then((r) => {
        setRestaurant(r);
        setForm({
          name: r.name ?? "",
          description: r.description ?? "",
          cuisineType: r.cuisineType ?? "multi_cuisine",
          address: r.address ?? "",
          city: r.city ?? "",
          phone: r.phone ?? "",
          email: r.email ?? "",
          upiId: r.upiId ?? "",
          upiName: r.upiName ?? "",
          personalUpiEnabled: r.personalUpiEnabled ?? false,
          whatsappNumber: r.whatsappNumber ?? "",
          taxPercent: String(r.taxPercent ?? 5),
          razorpayKeyId: (r as any).razorpayKeyId ?? "",
          razorpayKeySecret: (r as any).razorpayKeySecret ?? "",
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const setCred = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCredForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch<Restaurant>("/owner/restaurant", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          description: form.description || null,
          upiId: form.upiId || null,
          upiName: form.upiName || null,
          personalUpiEnabled: form.personalUpiEnabled,
          whatsappNumber: form.whatsappNumber || null,
          taxPercent: parseInt(form.taxPercent),
          razorpayKeyId: form.razorpayKeyId || null,
          razorpayKeySecret: form.razorpayKeySecret || null,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCredSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredError("");

    const hasEmailChange = credForm.newEmail.trim() !== "" && credForm.newEmail.trim() !== user?.email;
    const hasPasswordChange = credForm.newPassword !== "";

    if (!hasEmailChange && !hasPasswordChange) {
      setCredError("Enter a new email or new password to update.");
      return;
    }
    if (hasPasswordChange && credForm.newPassword !== credForm.confirmPassword) {
      setCredError("New passwords do not match.");
      return;
    }
    if (hasPasswordChange && credForm.newPassword.length < 6) {
      setCredError("New password must be at least 6 characters.");
      return;
    }

    setCredSaving(true);
    try {
      const body: Record<string, string> = { currentPassword: credForm.currentPassword };
      if (hasEmailChange) body.newEmail = credForm.newEmail.trim();
      if (hasPasswordChange) body.newPassword = credForm.newPassword;

      const result = await apiFetch<{ ok: boolean; emailChanged: boolean; passwordChanged: boolean }>(
        "/owner/account",
        { method: "PUT", body: JSON.stringify(body) }
      );

      setCredSaved(true);
      setCredForm({ currentPassword: "", newEmail: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => setCredSaved(false), 4000);

      if (result.emailChanged) {
        await refreshAuth();
      }
    } catch (err) {
      setCredError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setCredSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!restaurant && error) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-medium">{error}</p>
            <p className="text-sm text-red-500 mt-1">
              Your restaurant account could not be found. Please contact support.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const razorpayConfigured = !!(form.razorpayKeyId && form.razorpayKeySecret);

  return (
    <AppShell>
      <div className="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Restaurant Profile</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Update your restaurant information and payment settings
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Basic Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Restaurant Name</Label>
                <Input value={form.name} onChange={set("name")} required />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Description</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  value={form.description}
                  onChange={set("description")}
                  placeholder="Describe your restaurant..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cuisine Type</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.cuisineType}
                  onChange={set("cuisineType")}
                >
                  {CUISINE_TYPES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input type="tel" value={form.phone} onChange={set("phone")} required />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Email <span className="text-muted-foreground font-normal text-xs">(public)</span></Label>
                <Input type="email" value={form.email} onChange={set("email")} required />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.city} onChange={set("city")} required />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Address <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Input value={form.address} onChange={set("address")} placeholder="Street, area, landmark…" />
              </div>
            </div>
          </div>

          {/* Payment & Communication */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Payment & Communication</h2>
              <p className="text-xs text-muted-foreground mt-0.5">UPI, WhatsApp billing, and online payment gateway</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>WhatsApp Number</Label>
                <Input value={form.whatsappNumber} onChange={set("whatsappNumber")} placeholder="919876543210" />
                <p className="text-xs text-muted-foreground">Bills sent to customer or this number</p>
              </div>
              <div className="space-y-1.5">
                <Label>Tax Percentage (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="30"
                  value={form.taxPercent}
                  onChange={set("taxPercent")}
                  placeholder="5"
                />
                <p className="text-xs text-muted-foreground">Applied to all orders (GST etc.)</p>
              </div>
            </div>

            {/* Personal UPI */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-amber-500" />
                    <p className="text-sm font-semibold">Personal UPI Payments</p>
                    {form.personalUpiEnabled && form.upiId && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Customers pay via UPI deep link (GPay, PhonePe, Paytm) — you verify manually
                  </p>
                </div>
                <Switch
                  checked={form.personalUpiEnabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, personalUpiEnabled: v }))}
                  className="shrink-0 mt-0.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>UPI ID</Label>
                  <Input
                    value={form.upiId}
                    onChange={set("upiId")}
                    placeholder="restaurant@okaxis"
                  />
                  <p className="text-xs text-muted-foreground">e.g. name@okaxis, number@paytm</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Merchant Name <span className="text-muted-foreground font-normal text-xs">(shown in UPI app)</span></Label>
                  <Input
                    value={form.upiName}
                    onChange={set("upiName")}
                    placeholder={form.name || "Your Restaurant Name"}
                  />
                  <p className="text-xs text-muted-foreground">Defaults to restaurant name if blank</p>
                </div>
              </div>

              {/* Test UPI — shown whenever a UPI ID with @ is present, even if
                  the toggle is off, so owners can diagnose invalid VPAs quickly */}
              {form.upiId && form.upiId.includes("@") && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-blue-700">Test your UPI ID</p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        Opens a ₹1 payment in your UPI app — if the app shows a "technical glitch" or fails, your UPI ID is invalid or inactive.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const name = form.upiName || form.name || "Test";
                        const link = buildTestUpiLink(form.upiId, name);
                        console.log("[UPI TEST]", link);
                        window.location.href = link;
                      }}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Test UPI (₹1)
                    </button>
                  </div>
                  <p className="text-[10px] text-blue-500">
                    UPI ID being tested: <span className="font-mono font-semibold">{form.upiId.trim()}</span>
                  </p>
                </div>
              )}

              {form.personalUpiEnabled && !form.upiId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-amber-700">
                    Add your UPI ID above to activate Personal UPI payments for customers.
                  </p>
                </div>
              )}

              {form.personalUpiEnabled && form.upiId && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1">
                  <p className="text-xs font-semibold text-green-700">Personal UPI is active</p>
                  <p className="text-xs text-green-600">
                    Customers will see a "Pay via UPI" button at checkout that opens their installed UPI app directly. No Razorpay needed.
                  </p>
                </div>
              )}
            </div>

            {/* Razorpay */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">Razorpay Payment Gateway</p>
                    {razorpayConfigured && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Accept card, UPI, netbanking & wallets online — customers pay before the order is confirmed
                  </p>
                </div>
                <a
                  href="https://dashboard.razorpay.com/app/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium mt-0.5"
                >
                  Get Keys <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label>Key ID <span className="text-muted-foreground font-normal">(starts with rzp_)</span></Label>
                  <Input
                    value={form.razorpayKeyId}
                    onChange={set("razorpayKeyId")}
                    placeholder="rzp_live_XXXXXXXXXXXXXX"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Key Secret</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      value={form.razorpayKeySecret}
                      onChange={set("razorpayKeySecret")}
                      placeholder="Your Razorpay key secret"
                      className="font-mono text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Stored securely — never shared with customers</p>
                </div>
              </div>

              {!razorpayConfigured && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-amber-700">
                    Without Razorpay, customers can still choose Cash, UPI (deep link), or Card at checkout — but no online payment is collected.
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">{error}</div>
          )}

          <Button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white h-11"
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4 mr-2 text-green-300" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saved ? "Saved!" : "Save Changes"}
          </Button>
        </form>

        {/* Login Credentials */}
        <div className="mt-8">
          <div className="mb-4">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-muted-foreground" />
              Login Credentials
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Change your sign-in email or password. Current password is always required.
            </p>
          </div>

          <form onSubmit={handleCredSubmit} className="bg-card border border-border rounded-xl p-5 space-y-4">
            {/* Current login email display */}
            <div className="bg-muted/50 rounded-lg px-3 py-2.5 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Current login email:</span>
              <span className="text-sm font-mono font-medium">{user?.email}</span>
            </div>

            {/* Current password */}
            <div className="space-y-1.5">
              <Label>Current Password <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  type={showCredPasswords.current ? "text" : "password"}
                  value={credForm.currentPassword}
                  onChange={setCred("currentPassword")}
                  placeholder="Your current password"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCredPasswords((v) => ({ ...v, current: !v.current }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showCredPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="border-t border-border pt-4 grid grid-cols-1 gap-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Change email</p>
              <div className="space-y-1.5">
                <Label>New Login Email</Label>
                <Input
                  type="email"
                  value={credForm.newEmail}
                  onChange={setCred("newEmail")}
                  placeholder="new@email.com"
                />
                <p className="text-xs text-muted-foreground">Leave blank to keep your current email</p>
              </div>
            </div>

            <div className="border-t border-border pt-4 grid grid-cols-1 gap-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Change password</p>
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={showCredPasswords.new ? "text" : "password"}
                    value={credForm.newPassword}
                    onChange={setCred("newPassword")}
                    placeholder="Min 6 characters"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredPasswords((v) => ({ ...v, new: !v.new }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showCredPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Confirm New Password</Label>
                <div className="relative">
                  <Input
                    type={showCredPasswords.confirm ? "text" : "password"}
                    value={credForm.confirmPassword}
                    onChange={setCred("confirmPassword")}
                    placeholder="Repeat new password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredPasswords((v) => ({ ...v, confirm: !v.confirm }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showCredPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Leave both password fields blank to keep your current password</p>
              </div>
            </div>

            {credError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">{credError}</div>
            )}
            {credSaved && (
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Credentials updated successfully
              </div>
            )}

            <Button
              type="submit"
              variant="outline"
              className="w-full h-11 border-orange-300 text-orange-700 hover:bg-orange-50"
              disabled={credSaving || !credForm.currentPassword}
            >
              {credSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <KeyRound className="w-4 h-4 mr-2" />
              )}
              Update Login Credentials
            </Button>
          </form>
        </div>

        {restaurant && (
          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Restaurant slug: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{restaurant.slug}</code>
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
