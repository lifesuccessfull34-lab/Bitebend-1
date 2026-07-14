import React, { useEffect, useRef, useState } from "react";
import { KeyRound, Eye, EyeOff, X, Loader2, CheckCircle2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LoginPasswordDialogProps {
  onSuccess: () => void;
  onClose: () => void;
}

// Mirrors the strength rule enforced server-side in
// artifacts/api-server/src/routes/adminAuth.ts (PASSWORD_STRENGTH_REGEX).
const PASSWORD_STRENGTH_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function getStrengthError(password: string): string | null {
  if (password.length < 8) return "Must be at least 8 characters";
  if (!PASSWORD_STRENGTH_REGEX.test(password)) return "Must contain at least one letter and one number";
  return null;
}

export function LoginPasswordDialog({ onSuccess, onClose }: LoginPasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitTimer, setRateLimitTimer] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

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

  const strengthError = newPassword ? getStrengthError(newPassword) : null;

  const validate = (): boolean => {
    setFieldError(null);
    if (!currentPassword) {
      setFieldError("Current password is required");
      return false;
    }
    const err = getStrengthError(newPassword);
    if (err) {
      setFieldError(err);
      return false;
    }
    if (newPassword !== confirmPassword) {
      setFieldError("New password and confirmation do not match");
      return false;
    }
    if (newPassword === currentPassword) {
      setFieldError("New password must be different from your current password");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (rateLimited) return;

    setError(null);
    setLoading(true);
    try {
      await apiFetch<{ ok: boolean }>("/admin/auth/change-password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
        timeoutMs: 15_000,
      });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setRateLimited(true);
          setError("Too many attempts. Please wait before trying again.");
        } else if (err.status === 401) {
          setError("Current password is incorrect.");
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
              <KeyRound className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Change Login Password</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug max-w-xs">
                Update the password you use to sign in to the Super Admin Portal.
              </p>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Current Password
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setError(null); setFieldError(null); }}
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(null); setFieldError(null); }}
                className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="At least 8 characters, with a letter & number"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && (
              <p className={cn(
                "text-xs mt-1.5 flex items-center gap-1",
                strengthError ? "text-amber-600" : "text-emerald-600"
              )}>
                {strengthError ? (
                  <>⚠️ {strengthError}</>
                ) : (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Strong enough</>
                )}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setFieldError(null); }}
                className="w-full pr-10 pl-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Repeat new password"
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
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs mt-1.5 text-amber-600">Passwords do not match yet</p>
            )}
          </div>

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
              Change Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

