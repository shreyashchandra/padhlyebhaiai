import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { TOKEN_KEY, setUnauthorizedHandler } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setBilling(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/api/auth/me");
      setUser(data.user);
      setBilling(data.billing);
    } catch (err) {
      if (err?.response?.status === 401) logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (localStorage.getItem(TOKEN_KEY)) refresh();
  }, [logout, refresh]);

  useEffect(() => {
    const onUsage = () => localStorage.getItem(TOKEN_KEY) && refresh();
    window.addEventListener("plb:usage", onUsage);
    return () => window.removeEventListener("plb:usage", onUsage);
  }, [refresh]);

  const signIn = useCallback(async (mode, payload) => {
    const { data } = await api.post(mode === "login" ? "/api/auth/login" : "/api/auth/register", payload);
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setUser(data.user);
    setBilling(data.billing);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({ user, setUser, billing, setBilling, loading, signIn, logout, refresh }),
    [user, billing, loading, signIn, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
