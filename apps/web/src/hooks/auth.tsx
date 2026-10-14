import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, token } from '../lib/api';

type User = { user_id: string; email: string; role: string; display_name: string; shop_id: string };
const Ctx = createContext<{ user: User | null; loading: boolean; login: (e: string, p: string) => Promise<void>; logout: () => void }>({ user: null, loading: true, login: async () => {}, logout: () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!token()) { setLoading(false); return; }
    api.get('/auth/me').then((r) => setUser(r.user)).catch(() => setToken('')).finally(() => setLoading(false));
  }, []);
  const login = async (email: string, password: string) => {
    const r = await api.login(email, password);
    setToken(r.token);
    setUser(r.user);
  };
  const logout = () => { setToken(''); setUser(null); };
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
