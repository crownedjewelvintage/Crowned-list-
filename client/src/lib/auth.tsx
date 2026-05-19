import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiRequest, setAuthToken, getAuthToken } from "./queryClient";

interface User {
  id: number;
  username: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  // No persistence (sandboxed iframe blocks storage); token lives in memory.
  // First load just initializes loading=false.
  useEffect(() => {
    if (getAuthToken()) {
      apiRequest("GET", "/api/auth/me")
        .then((r) => r.json())
        .then((u) => setUser(u))
        .catch(() => setAuthToken(null));
    }
  }, []);

  const login = async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      const data = await res.json();
      setAuthToken(data.token);
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const signup = async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/signup", { username, password });
      const data = await res.json();
      setAuthToken(data.token);
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, signup, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
