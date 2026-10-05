"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  apiUrl: string;
  user: User | null;
  token: string | null;
  /** True until the stored session has been checked. */
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): void;
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = "textshare:token";

export function AuthProvider({ apiUrl, children }: { apiUrl: string; children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const rawRequest = useCallback(
    async <T,>(path: string, init: RequestInit = {}, authToken: string | null = null): Promise<T> => {
      const headers = new Headers(init.headers);
      if (init.body) headers.set("Content-Type", "application/json");
      if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
      const res = await fetch(`${apiUrl}${path}`, { ...init, headers });
      if (res.status === 204) return undefined as T;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      return data as T;
    },
    [apiUrl],
  );

  const setSession = useCallback((nextToken: string | null, nextUser: User | null) => {
    try {
      if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // storage unavailable - session lasts for this page only
    }
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(TOKEN_KEY);
    } catch {}
    const check = stored
      ? rawRequest<{ user: User }>("/api/auth/me", {}, stored)
          .then(({ user }) => setSession(stored, user))
          .catch(() => setSession(null, null))
      : Promise.resolve();
    check.finally(() => setLoading(false));
  }, [rawRequest, setSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      apiUrl,
      user,
      token,
      loading,
      async login(email, password) {
        const res = await rawRequest<{ token: string; user: User }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setSession(res.token, res.user);
      },
      async register(name, email, password) {
        const res = await rawRequest<{ token: string; user: User }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password }),
        });
        setSession(res.token, res.user);
      },
      logout() {
        setSession(null, null);
      },
      request: (path, init) => rawRequest(path, init, token),
    }),
    [apiUrl, user, token, loading, rawRequest, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
