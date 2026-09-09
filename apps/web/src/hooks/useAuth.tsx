'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CONFIG } from '@/lib/constants';
import { isProfileComplete } from '@/lib/profile';

// 가입 완료(필수정보 입력) 전이라도 접근을 허용하는 경로
const PROFILE_GATE_ALLOWLIST = ['/register', '/login', '/terms', '/privacy'];

interface User {
  id: string;
  name: string;
  nickname?: string;
  profileImageUrl?: string;
  email?: string;
  phone: string;
  /** 문자 인증으로 확인된 번호인지 (해외 번호는 인증 없이 등록되므로 false) */
  phoneVerified?: boolean;
  birthDate?: string;
  gender?: string;
  address?: string;
  detailAddress?: string;
  zipCode?: string;
  addressCountry?: string;
  addressCity?: string;
  addressState?: string;
  roles: string[];
  company?: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
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

  // 로그인은 됐지만 필수정보(가입 완료)가 없으면 가입 정보 입력 페이지로 강제 이동
  useEffect(() => {
    if (loading || !user || isProfileComplete(user)) return;
    const allowed = PROFILE_GATE_ALLOWLIST.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (!allowed) {
      router.replace(`/register?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [user, loading, pathname, router]);

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

  const logout = async () => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refresh }}>
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
