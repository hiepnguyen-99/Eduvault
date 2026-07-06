"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, DashboardData, User } from "@/lib/api";
import { permissionsForRole } from "@/src/config/role-menu";

type AuthContextValue = {
  token: string;
  user: User | null;
  ready: boolean;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  login: (code: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_BOOT_TIMEOUT_MS = 5000;

function normalizeUser(user: User): User {
  const rolePermissions = permissionsForRole(user.role);
  return {
    ...user,
    permissions: Array.from(new Set([...(user.permissions || []), ...rolePermissions])),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem("eduvault_token") || "";
    setToken(savedToken);

    if (!savedToken) {
      setUser(null);
      setReady(true);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), AUTH_BOOT_TIMEOUT_MS);
    api<DashboardData>("/api/dashboard", { signal: controller.signal }, savedToken)
      .then((data) => {
        const nextUser = normalizeUser(data.user);
        setUser(nextUser);
      })
      .catch(() => {
        localStorage.removeItem("eduvault_token");
        setToken("");
        setUser(null);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        setReady(true);
      });
  }, []);

  async function login(code: string, password: string) {
    const result = await api<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ code, password }),
    });
    const nextUser = normalizeUser(result.user);
    localStorage.setItem("eduvault_token", result.token);
    setToken(result.token);
    setUser(nextUser);
    setReady(true);
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" }, token);
    } finally {
      localStorage.removeItem("eduvault_token");
      setToken("");
      setUser(null);
    }
  }

  const request = useCallback(async function request<T>(path: string, options: RequestInit = {}) {
    try {
      return await api<T>(path, options, token);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        localStorage.removeItem("eduvault_token");
        setToken("");
        setUser(null);
      }
      throw error;
    }
  }, [token]);

  return <AuthContext.Provider value={{ token, user, ready, request, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
