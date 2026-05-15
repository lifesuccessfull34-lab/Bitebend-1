import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, Lock, ChevronRight, AlertTriangle } from "lucide-react";
import logo from "@/assets/logo.png";

export default function AdminLogin() {
  const { login, logout } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Clear any existing session (e.g. owner session) before logging in as admin
      await logout().catch(() => {});
      const user = await login(email, password);
      if (user.role !== "super_admin") {
        // Not an admin — log them back out immediately so owner session doesn't linger
        await logout().catch(() => {});
        setError("Access denied. This portal is for administrators only.");
        return;
      }
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — saffron brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2" />

        <div className="relative z-10 text-center text-white space-y-6">
          <img src={logo} alt="Bitebend" className="w-52 h-auto object-contain mx-auto" style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.45))" }} />
          <div>
            <h1 className="text-4xl font-black tracking-tight drop-shadow">Bitebend</h1>
            <div className="inline-flex items-center gap-2 mt-2 bg-black/20 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-sm font-semibold tracking-widest uppercase">Admin Control Center</span>
            </div>
          </div>
          <p className="text-white/80 text-base max-w-xs leading-relaxed">
            Manage restaurants, subscriptions, payments and platform operations from one place.
          </p>

          <div className="grid grid-cols-3 gap-4 mt-8">
            {[
              { label: "Restaurants", val: "All" },
              { label: "Plans", val: "Live" },
              { label: "Payments", val: "Track" },
            ].map((s) => (
              <div key={s.label} className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                <p className="text-lg font-bold">{s.val}</p>
                <p className="text-xs text-white/70">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col items-center justify-center bg-amber-50 p-6">
        {/* Mobile logo */}
        <div className="lg:hidden text-center mb-8">
          <img src={logo} alt="Bitebend" className="w-44 h-auto object-contain mx-auto mb-1" />
          <h1 className="text-2xl font-black text-gray-900">Bitebend</h1>
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-widest mt-0.5">Admin Control Center</p>
        </div>

        <div className="w-full max-w-md">
          {/* Form card */}
          <div className="bg-white rounded-3xl shadow-2xl border border-orange-100 overflow-hidden">
            {/* Card header stripe */}
            <div className="h-2 bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500" />

            <div className="p-8">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Administrator Sign In</h2>
                  <p className="text-xs text-gray-500">Restricted — authorised personnel only</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                    Admin Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@bitebend.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11 border-gray-200 focus-visible:ring-orange-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 border-gray-200 focus-visible:ring-orange-400"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Sign In to Admin Panel
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => navigate("/admin/forgot-password")}
                    className="text-sm text-gray-500 hover:text-orange-600 transition-colors"
                  >
                    Forgot your password?
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
