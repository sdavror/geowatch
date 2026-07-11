'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { API_BASE_URL } from './api';
import type { AuthResponse } from '@geowatch/shared-types';

type Role = 'superadmin' | 'editor' | 'viewer';
interface SessionUser {
  id: string;
  email: string;
  role: Role;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (input: { displayName?: string; avatarUrl?: string | null }) => Promise<void>;
  canEdit: boolean;
  isOwner: boolean;
}

const ACCESS_KEY = 'geowatch-access-token';
const REFRESH_KEY = 'geowatch-refresh-token';
const USER_KEY = 'geowatch-user';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(readStoredUser());
    setLoading(false);
  }, []);

  const persist = (data: AuthResponse) => {
    window.localStorage.setItem(ACCESS_KEY, data.accessToken);
    window.localStorage.setItem(REFRESH_KEY, data.refreshToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user as SessionUser);
  };

  const authRequest = async (path: string, email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.message ?? 'Request failed');
    }
    persist(body as AuthResponse);
  };

  const login = (email: string, password: string) =>
    authRequest('/auth/login', email, password);
  const register = (email: string, password: string) =>
    authRequest('/auth/register', email, password);

  const logout = () => {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  const updateProfile = async (input: { displayName?: string; avatarUrl?: string | null }) => {
    const updated = await authFetch<SessionUser>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    setUser((prev) => {
      const next = prev ? { ...prev, ...updated } : updated;
      window.localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  };

  const canEdit = user?.role === 'editor' || user?.role === 'superadmin';
  const isOwner = user?.role === 'superadmin';

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, updateProfile, canEdit, isOwner }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/** fetch() that attaches the bearer token; JSON in, JSON out. */
export async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { message?: string }).message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

/** Multipart image upload (any authenticated user) — returns { imageUrl }. */
export async function uploadImage(file: File): Promise<{ imageUrl: string }> {
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { message?: string }).message ?? 'Upload failed');
  }
  return body as { imageUrl: string };
}
