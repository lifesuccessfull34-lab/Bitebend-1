import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, setUnauthorizedHandler } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Dismiss the HTML loading screen (defined in main.tsx, registered on window).
function dismissHtmlLoader() {
  try {
    (window as unknown as { __hideAppLoader__?: () => void }).__hideAppLoader__?.();
    // Unset so it can't be called twice and cause a flicker.
    (window as unknown as { __hideAppLoader__?: () => void }).__hideAppLoader__ = undefined;
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(() => {});
  }, []);

  const refresh = async () => {
    try {
      const data = await apiFetch<{ user: AuthUser }>("/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    // Hard wall-clock bail-out: if the auth check hasn't settled within 6 s
    // (network stall, JS error, anything), force loading=false so the login
    // page is shown instead of an infinite spinner.
    // The apiFetch also has its own 6s AbortController timeout so both fire
    // together cleanly in the worst case.
    let settled = false;
    const bail = setTimeout(() => {
      if (!settled) {
        setLoading(false);
        dismissHtmlLoader();
      }
    }, 6000);

    refresh().finally(() => {
      settled = true;
      clearTimeout(bail);
      setLoading(false);
      // Dismiss the HTML spinner now that auth has settled and React has
      // rendered the correct page (login or dashboard) underneath it.
      dismissHtmlLoader();
    });

    return () => clearTimeout(bail);
  }, []);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const data = await apiFetch<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await apiFetch("/auth/logout", { method: "POST" });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
