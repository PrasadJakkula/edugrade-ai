import React, { createContext, useContext, useEffect, useState } from "react";
import { AuthUser } from "../types";
import { apiRequest, getStoredToken } from "../lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  demoLogin: () => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const token = getStoredToken();
      const saved = localStorage.getItem("evaluai_user");
      return token && saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("evaluai:unauthorized", onUnauthorized);

    if (getStoredToken()) {
      apiRequest<{ user: AuthUser }>("/users/me")
        .then((data) => {
          if (data?.user) {
            localStorage.setItem("evaluai_user", JSON.stringify(data.user));
            setUser(data.user);
          }
        })
        .catch(() => {
          // 401 listener clears state automatically
        });
    }
    return () => window.removeEventListener("evaluai:unauthorized", onUnauthorized);
  }, []);

  const saveSession = (token: string, u: AuthUser) => {
    localStorage.setItem("evaluai_access_token", token);
    localStorage.setItem("evaluai_user", JSON.stringify(u));
    setUser(u);
  };

  const login = async (email: string, password: string) => {
    const data = await apiRequest<{ access_token: string; user: AuthUser }>("/users/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveSession(data.access_token, data.user);
    return data.user;
  };

  const demoLogin = async () => {
    const data = await apiRequest<{ access_token: string; user: AuthUser }>("/users/demo-login", {
      method: "POST",
    });
    saveSession(data.access_token, data.user);
    return data.user;
  };

  const register = async (name: string, email: string, password: string) => {
    await apiRequest("/users/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  };

  const logout = () => {
    localStorage.removeItem("evaluai_access_token");
    localStorage.removeItem("evaluai_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, demoLogin, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
