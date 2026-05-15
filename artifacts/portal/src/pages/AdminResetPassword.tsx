import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import {
  Shield,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  XCircle,
} from "lucide-react";
import logo from "@/assets/logo.png";

type TokenStatus = "checking" | "valid" | "invalid";

export default function AdminResetPassword() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenStatus("invalid");
      return;
    }
    apiFetch<{ valid: boolean }>(
      `/admin/auth/validate-reset-token?token=${encodeURIComponent(token)}`,
    )
      .then((d) => setTokenStatus(d.valid ? "valid" : "invalid"))
      .catch(() => setTokenStatus("invalid"));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiFetch("/admin/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/3" />
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
            Choose a strong password to secure your administrator account.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-amber-50 p-6">
        <div className="lg:hidden text-center mb-8">
          <img src={logo} alt="Bitebend" className="w-44 h-auto object-contain mx-auto mb-1" />
          <h1 className="text-2xl font-black text-gray-900">Bitebend</h1>
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-widest mt-0.5">Admin Control Center</p>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-orange-100 overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500" />

            <div className="p-8">
              {/* Checking token */}
              {tokenStatus === "checking" && (
                <div className="text-center py-8 space-y-4">
                  <Loader2 className="w-10 h-10 animate-spin text-orange-500 mx-auto" />
                  <p className="text-gray-500 text-sm">Validating reset link…</p>
                </div>
              )}

              {/* Invalid / expired token */}
              {tokenStatus === "invalid" && (
                <div className="text-center space-y-5">
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 mx-auto">
                    <XCircle className="w-8 h-8 text-red-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Link Expired or Invalid</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      This password reset link has expired, already been used, or is invalid.
                      Reset links are valid for 30 minutes and can only be used once.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate("/admin/forgot-password")}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm shadow-lg shadow-orange-200 transition-all"
                  >
                    Request a New Reset Link
                  </button>
                  <button
                    onClick={() => navigate("/admin/login")}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-orange-600 transition-colors mx-auto"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Admin Login
                  </button>
                </div>
              )}

              {/* Success */}
              {tokenStatus === "valid" && done && (
                <div className="text-center space-y-5">
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Password Reset!</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Your admin password has been updated. You can now sign in with your new password.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate("/admin/login")}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2"
                  >
                    Sign In to Admin Panel
                  </button>
                </div>
              )}

              {/* Reset form */}
              {tokenStatus === "valid" && !done && (
                <>
                  <div className="flex items-center gap-3 mb-7">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                      <Lock className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Set New Password</h2>
                      <p className="text-xs text-gray-500">Admin account only</p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-password" className="text-sm font-semibold text-gray-700">
                        New Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="new-password"
                          type={showNew ? "text" : "password"}
                          placeholder="Minimum 8 characters"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          autoFocus
                          autoComplete="new-password"
                          className="h-11 border-gray-200 focus-visible:ring-orange-400 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNew((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          tabIndex={-1}
                        >
                          {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {newPassword.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {[...Array(4)].map((_, i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-colors ${
                                newPassword.length >= [8, 12, 16, 20][i]
                                  ? ["bg-red-400", "bg-amber-400", "bg-yellow-400", "bg-green-500"][i]
                                  : "bg-gray-200"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-password" className="text-sm font-semibold text-gray-700">
                        Confirm New Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="confirm-password"
                          type={showConfirm ? "text" : "password"}
                          placeholder="Re-enter new password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          autoComplete="new-password"
                          className="h-11 border-gray-200 focus-visible:ring-orange-400 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirm((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          tabIndex={-1}
                        >
                          {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                        <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                      )}
                      {confirmPassword.length > 0 && newPassword === confirmPassword && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Passwords match
                        </p>
                      )}
                    </div>

                    {error && (
                      <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || newPassword !== confirmPassword || newPassword.length < 8}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          Reset Password
                        </>
                      )}
                    </button>
                  </form>

                  <button
                    onClick={() => navigate("/admin/login")}
                    className="flex items-center gap-1.5 mt-6 text-sm text-gray-500 hover:text-orange-600 transition-colors mx-auto"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Admin Login
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
