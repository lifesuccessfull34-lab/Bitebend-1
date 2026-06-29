import React, { useState, useEffect, useRef } from "react";
import { ShieldCheck, Eye, EyeOff, X, Loader2, Lock, KeyRound } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import type { SensitiveAuthDialogMode } from "@/hooks/useSensitiveAuth";

interface SensitiveAuthDialogProps {
  mode: SensitiveAuthDialogMode;
  onSuccess: (expiresAt: number) => void;
  onClose: () => void;
}

const MODE_CONFIG = {
  setup: {
    title: "Set Up Sensitive Action Password",
    subtitle:
      "This is a separate password from your login password. It will be required before any sensitive operation — exports, deletions, and other high-impact actions. Set a strong password and store it securely.",
    submitLabel: "Save Password",
    icon: KeyRound,
    endpoint: "/admin/sensitive-auth/setup" as const,
    method: "POST" as const,
  },
  verify: {
    title: "Sensitive Action Password Required",
    subtitle: "Enter your Sensitive Action Password to unlock protected operations for 5 minutes.",
    submitLabel: "Unlock",
    icon: ShieldCheck,
    endpoint: "/admin/sensitive-auth/verify" as const,
    method: "POST" as const,
  },
  change: {
    title: "Change Sensitive Action Password",
    subtitle: "Enter your current password and choose a new one. The session will be locked after changing.",
    submitLabel: "Change Password",
    icon: Lock,
    endpoint: "/admin/sensitive-auth/change" as const,
    method: "PUT" as const,
  },
};

export function SensitiveAuthDialog({ mode, onSuccess, onClose }: SensitiveAuthDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitTimer, setRateLimitTimer] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    if (!rateLimited) return;
    setRateLimitTimer(60);
    const interval = setInterval(() => {
      setRateLimitTimer((t) => {
        if (t <= 1) { clearInterval(interval); setRateLimited(false); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimited]);

  const validate = (): boolean => {
    setFieldError(null);
    if (mode === "setup" || mode === "change") {
      const newPwd = mode === "setup" ? password : password;
      if (newPwd.length < 8) {
        setFieldError("Password must be at least 8 characters");
        return false;
      }
      if (newPwd !== confirmPassword) {
        setFieldError("Passwords do not match");
        return false;
      }
    }
    return true;
  };

  const buildBody = () => {
    if (mode === "setup") return JSON.stringify({ password });
    if (mode === "verify") return JSON.stringify({ password });
    return JSON.stringify({ currentPassword, newPassword: password });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (rateLimited) return;

    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ ok: boolean; expiresAt?: number }>(config.endpoint, {
        method: config.method,
        body: buildBody(),
        timeoutMs: 15_000,
      });
      if (result.ok && result.expiresAt) {
        onSuccess(result.expiresAt);
      } else if (result.ok) {
        onClose();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setRateLimited(true);
          setError("Too many attempts. Please wait before trying again.");
        } else if (err.status === 401) {
          setError("Incorrect password. Please try again.");
        } else if (err.status === 404) {
          setError("No sensitive action password has been set up yet.");
        } else {
          setError(err.message || "Something went wrong. Please try again.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{config.title}</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug max-w-xs">{config.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors ml-2 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {mode === "change" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Current Password
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setError(null); }}
                  className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Current password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {mode === "verify" ? "Sensitive Action Password" : mode === "change" ? "New Password" : "Password"}
            </label>
            <div className="relative">
              <input
                ref={mode !== "change" ? inputRef : undefined}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); setFieldError(null); }}
                className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder={mode === "verify" ? "Enter your password" : "Minimum 8 characters"}
                autoComplete={mode === "verify" ? "current-password" : "new-password"}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {(mode === "setup" || mode === "change") && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setFieldError(null); }}
                  className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {fieldError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <X className="w-3.5 h-3.5 flex-shrink-0" />
              {fieldError}
            </p>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
              {rateLimited && rateLimitTimer > 0 && (
                <span className="ml-1 font-medium">Try again in {rateLimitTimer}s.</span>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || rateLimited}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {config.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
