'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CONFIG } from '@/lib/constants';

interface User {
  id: string;
  name: string;
  phone: string;
  roles: string[];
  company?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = CONFIG.API_BASE;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // 어디서든 401이 발생하면 로그인 페이지로 이동
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      if (pathname !== '/login') {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      }
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [pathname, router]);

  const refresh = async () => {
    try {
      let res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });

      // access_token 만료 시 refresh_token으로 재발급 후 재시도
      if (res.status === 401) {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (refreshRes.ok) {
          res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
        }
      }

      if (res.ok) {
        setUser(await res.json());
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (phone: string, code: string) => {
    const res = await fetch(`${API_BASE}/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || '로그인 실패');
    }
    setUser(await res.json());
  };

  const logout = async () => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
