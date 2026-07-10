import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '../lib/api';

interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
}

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'jigsaw_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Persist session to localStorage
  const saveSession = (s: Session, u: User) => {
    setSession(s);
    setUser(u);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  };

  const clearSession = () => {
    setSession(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }

    const s: Session = JSON.parse(stored);

    // Check if token is expired (with 60s buffer)
    const nowSec = Math.floor(Date.now() / 1000);
    if (s.expires_at && s.expires_at < nowSec + 60) {
      // Try refreshing
      apiFetch<{ access_token: string; refresh_token: string; expires_at: number }>('/api/auth/refresh', {
        method: 'POST',
        body: { refresh_token: s.refresh_token },
      })
        .then((refreshed) => {
          const newSession: Session = {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: refreshed.expires_at,
          };
          return apiFetch<User>('/api/auth/me', { token: newSession.access_token }).then((u) => {
            saveSession(newSession, u);
          });
        })
        .catch(() => clearSession())
        .finally(() => setIsLoading(false));
    } else {
      // Token still valid — fetch user profile
      apiFetch<User>('/api/auth/me', { token: s.access_token })
        .then((u) => {
          setSession(s);
          setUser(u);
        })
        .catch(() => clearSession())
        .finally(() => setIsLoading(false));
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ session: Session; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    saveSession(res.session, res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, username: string) => {
    await apiFetch('/api/auth/register', {
      method: 'POST',
      body: { email, password, username },
    });
    // Auto-login after register
    await login(email, password);
  }, [login]);

  const logout = useCallback(() => {
    clearSession();
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => prev ? { ...prev, ...updates } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, isLoading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
