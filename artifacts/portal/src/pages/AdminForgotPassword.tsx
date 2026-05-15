import { useState } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import {
  Shield,
  Loader2,
  ArrowLeft,
  Mail,
  CheckCircle2,
  Copy,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

export default function AdminForgotPassword() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<{ ok: boolean; resetLink?: string }>(
        "/admin/auth/forgot-password",
        {
          method: "POST",
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        },
      );
      setResetLink(data.resetLink ?? null);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!resetLink) return;
    await navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="relative z-10 text-center text-white space-y-6">
          <div className="flex items-center justify-center w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-sm mx-auto shadow-2xl border border-white/30">
            <Shield className="w-12 h-12 text-white drop-shadow" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight drop-shadow">Bitebend</h1>
            <div className="inline-flex items-center gap-2 mt-2 bg-black/20 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/20">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-sm font-semibold tracking-widest uppercase">Admin Control Center</span>
            </div>
          </div>
          <p className="text-white/80 text-base max-w-xs leading-relaxed">
            Enter your admin email address and we'll send you a secure link to reset your password.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-amber-50 p-6">
        <div className="lg:hidden text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 shadow-lg mb-3">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Bitebend</h1>
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-widest mt-0.5">Admin Control Center</p>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-orange-100 overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500" />

            <div className="p-8">
              {!submitted ? (
                <>
                  <div className="flex items-center gap-3 mb-7">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Forgot Password</h2>
                      <p className="text-xs text-gray-500">Admin accounts only</p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                    Enter your administrator email address. If it matches an admin account,
                    you'll receive a secure reset link valid for 30 minutes.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                        Admin Email Address
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="admin@bitebend.in"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        autoFocus
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
                          <Mail className="w-4 h-4" />
                          Send Reset Link
                        </>
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <div className="text-center space-y-5">
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Check Your Email</h2>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      If <strong>{email}</strong> is a registered admin account, a
                      reset link has been sent. The link expires in 30 minutes and
                      can only be used once.
                    </p>
                  </div>

                  {resetLink && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left space-y-3">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                        Email not configured — use this link directly
                      </p>
                      <p className="text-xs text-gray-600 break-all font-mono bg-white border border-amber-100 rounded-lg p-2">
                        {resetLink}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCopy}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold h-8 rounded-lg border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 transition-colors"
                        >
                          {copied ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copy Link
                            </>
                          )}
                        </button>
                        <a
                          href={resetLink}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold h-8 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open Link
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => navigate("/admin/login")}
                className="flex items-center gap-1.5 mt-6 text-sm text-gray-500 hover:text-orange-600 transition-colors mx-auto"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Admin Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
