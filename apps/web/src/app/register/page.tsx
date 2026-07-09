'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import { isProfileComplete } from '@/lib/profile';
import { resolvePostAuthDestination } from '@/lib/auth-redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_BASE = CONFIG.API_BASE;

function RegisterForm() {
  const { user, loading: authLoading, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    birthDate: '',
    gender: '',
    zipCode: '',
    address: '',
    detailAddress: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 미로그인 시 로그인으로, 이미 필수정보가 있으면 원래 목적지로 보낸다.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (isProfileComplete(user)) {
      goToDestination();
      return;
    }
    // 소셜/휴대폰 로그인에서 받아온 값 선채움
    setForm((prev) => ({
      ...prev,
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      birthDate: user.birthDate || '',
      gender: user.gender || '',
      zipCode: user.zipCode || '',
      address: user.address || '',
      detailAddress: user.detailAddress || '',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const goToDestination = () => {
    const dest = resolvePostAuthDestination(searchParams, API_BASE);
    if ('external' in dest) {
      window.location.href = dest.external;
    } else {
      router.replace(dest.internal);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const missing =
      !form.name.trim() ||
      !form.gender ||
      !form.birthDate ||
      !form.phone.trim() ||
      !form.email.trim() ||
      !form.address.trim();
    if (missing) {
      setError('필수 항목을 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      await refresh();
      goToDestination();
    } catch {
      setError('가입 정보 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user || isProfileComplete(user)) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">가입 정보 입력</CardTitle>
          <CardDescription>
            서비스 이용을 위해 아래 필수 정보를 입력해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">이름 *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">전화번호 *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="010-1234-5678"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">이메일 *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">생년월일 *</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>성별 *</Label>
                <div className="flex gap-4 h-10 items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value="M"
                      checked={form.gender === 'M'}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    />{' '}
                    남성
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value="F"
                      checked={form.gender === 'F'}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    />{' '}
                    여성
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>주소 *</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="우편번호"
                  className="w-24"
                  value={form.zipCode}
                  onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                />
                <Input
                  placeholder="기본 주소"
                  className="flex-1"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                />
              </div>
              <Input
                placeholder="상세 주소"
                value={form.detailAddress}
                onChange={(e) => setForm({ ...form, detailAddress: e.target.value })}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '저장 중...' : '가입 완료'}
            </Button>

            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              입력하신 정보는{' '}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                개인정보처리방침
              </a>
              에 따라 처리됩니다.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
