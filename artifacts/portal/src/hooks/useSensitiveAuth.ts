import { useState, useCallback, useRef } from "react";
import { apiFetch, ApiError } from "@/lib/api";

export interface SensitiveAuthStatus {
  configured: boolean;
  unlocked: boolean;
  expiresAt: number | null;
  lastChangedAt: string | null;
}

export type SensitiveAuthDialogMode = "setup" | "verify" | "change";

export interface SensitiveAuthDialogState {
  open: boolean;
  mode: SensitiveAuthDialogMode;
  onSuccess: (expiresAt: number) => void;
  onClose: () => void;
}

export function useSensitiveAuth() {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [dialogState, setDialogState] = useState<SensitiveAuthDialogState | null>(null);
  const [checking, setChecking] = useState(false);

  const pendingActionRef = useRef<(() => void) | null>(null);

  const isUnlocked = expiresAt !== null && Date.now() < expiresAt;

  const handleUnlocked = useCallback((newExpiresAt: number) => {
    setExpiresAt(newExpiresAt);
    setDialogState(null);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) action();
  }, []);

  const triggerSensitiveAction = useCallback(async (action: () => void) => {
    if (expiresAt && Date.now() < expiresAt) {
      action();
      return;
    }

    setChecking(true);
    try {
      const status = await apiFetch<SensitiveAuthStatus>("/admin/sensitive-auth/status");
      if (status.unlocked && status.expiresAt && Date.now() < status.expiresAt) {
        setExpiresAt(status.expiresAt);
        action();
        return;
      }
      pendingActionRef.current = action;
      setDialogState({
        open: true,
        mode: status.configured ? "verify" : "setup",
        onSuccess: handleUnlocked,
        onClose: () => {
          pendingActionRef.current = null;
          setDialogState(null);
        },
      });
    } catch {
      // If status check fails, show verify dialog as fallback
      pendingActionRef.current = action;
      setDialogState({
        open: true,
        mode: "verify",
        onSuccess: handleUnlocked,
        onClose: () => {
          pendingActionRef.current = null;
          setDialogState(null);
        },
      });
    } finally {
      setChecking(false);
    }
  }, [expiresAt, handleUnlocked]);

  const openChangeDialog = useCallback(() => {
    setDialogState({
      open: true,
      mode: "change",
      onSuccess: (newExpiresAt) => {
        setExpiresAt(newExpiresAt);
        setDialogState(null);
      },
      onClose: () => setDialogState(null),
    });
  }, []);

  const lock = useCallback(async () => {
    try {
      await apiFetch("/admin/sensitive-auth/lock", { method: "POST" });
    } catch {
      // ignore
    }
    setExpiresAt(null);
  }, []);

  return {
    isUnlocked,
    expiresAt,
    checking,
    triggerSensitiveAction,
    openChangeDialog,
    lock,
    dialogState,
  };
}
