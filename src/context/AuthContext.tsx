import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setApiBaseUrl } from '../services/api';
import { AuthUser, UNAUTHORIZED_EVENT, clearSession, getStoredUser, storeSession } from '../services/auth';

interface AuthContextValue {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const complete = (session: { token: string; user: AuthUser }) => {
    storeSession(session.token, session.user);
    setUser(session.user);
  };

  const login = async (username: string, password: string) => complete(await api.login(username, password));
  const register = async (username: string, password: string) => complete(await api.register(username, password));

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export { setApiBaseUrl };
