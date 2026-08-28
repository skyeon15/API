'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import { isProfileComplete } from '@/lib/profile';
import { resolvePostAuthDestination } from '@/lib/auth-redirect';
import { openPostcodeSearch } from '@/lib/postcode';
import { formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_BASE = CONFIG.API_BASE;

function RegisterForm() {
  const { user, loading: authLoading, refresh, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    name: '',
    nickname: '',
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

  // 전화번호 본인인증 (소셜에서 번호가 넘어오지 않은 계정만 필요)
  const phoneVerified = Boolean(user?.phone);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');

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
    // 소셜/휴대폰 로그인에서 받아온 값 선채움 (사용자가 이미 입력한 값은 덮어쓰지 않는다)
    setForm((prev) => ({
      ...prev,
      name: prev.name || user.name || '',
      nickname: prev.nickname || user.nickname || '',
      email: prev.email || user.email || '',
      phone: user.phone || prev.phone,
      birthDate: prev.birthDate || user.birthDate || '',
      gender: prev.gender || user.gender || '',
      zipCode: prev.zipCode || user.zipCode || '',
      address: prev.address || user.address || '',
      detailAddress: prev.detailAddress || user.detailAddress || '',
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

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPhoneCode = async () => {
    setPhoneError('');
    if (!form.phone.trim()) {
      setPhoneError('전화번호를 입력해주세요.');
      return;
    }
    setPhoneLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/auth/request-phone-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: form.phone }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '인증번호 발송에 실패했습니다.');
      }
      setCodeSent(true);
    } catch (err: any) {
      setPhoneError(err.message || '인증번호 발송에 실패했습니다.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    setPhoneError('');
    setPhoneLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/auth/verify-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: form.phone, code }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '인증에 실패했습니다.');
      }
      setCodeSent(false);
      setCode('');
      await refresh();
    } catch (err: any) {
      setPhoneError(err.message || '인증에 실패했습니다.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleFindAddress = async () => {
    try {
      const picked = await openPostcodeSearch();
      // 그냥 닫은 경우다. 적어 두던 상세 주소를 지우지 않는다.
      if (!picked) return;
      setForm((f) => ({ ...f, zipCode: picked.zonecode, address: picked.address }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '주소를 찾지 못했어요.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phoneVerified) {
      setError('전화번호 본인인증을 완료해주세요.');
      return;
    }

    const missing =
      !form.name.trim() ||
      !form.gender ||
      !form.birthDate ||
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
                <p className="text-xs text-muted-foreground">
                  배송·결제에 쓰이므로 실명을 적어 주세요.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">닉네임</Label>
                <Input
                  id="nickname"
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="서비스에서 불릴 이름 (선택)"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="phone">전화번호 *</Label>
                {phoneVerified ? (
                  <>
                    <Input id="phone" value={formatPhone(form.phone)} disabled readOnly />
                    <p className="text-xs text-muted-foreground">
                      본인인증으로 확인된 번호라 직접 수정할 수 없습니다.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="010-1234-5678"
                        className="flex-1"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        disabled={codeSent}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={codeSent ? () => setCodeSent(false) : handleRequestPhoneCode}
                        disabled={phoneLoading}
                      >
                        {codeSent ? '번호 변경' : phoneLoading ? '발송 중...' : '인증번호 받기'}
                      </Button>
                    </div>
                    {codeSent && (
                      <div className="flex gap-2">
                        <Input
                          id="code"
                          type="text"
                          placeholder="6자리 숫자"
                          maxLength={6}
                          className="flex-1 tracking-widest"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                        />
                        <Button type="button" onClick={handleVerifyPhone} disabled={phoneLoading}>
                          {phoneLoading ? '확인 중...' : '인증 확인'}
                        </Button>
                      </div>
                    )}
                    {phoneError && (
                      <p className="text-xs text-destructive">{phoneError}</p>
                    )}
                  </>
                )}
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
              {/* 우편번호와 기본 주소는 검색으로만 넣는다 — 손으로 적으면 표기가 제각각이 되고
                  5자리를 틀리면 배송이 안 간다. 상세 주소만 직접 적는다. */}
              <div className="flex gap-2">
                <Input placeholder="우편번호" className="w-24" value={form.zipCode} readOnly />
                <Input
                  placeholder="주소 검색을 눌러 주세요"
                  className="flex-1"
                  value={form.address}
                  readOnly
                  required
                />
                <Button type="button" variant="outline" onClick={handleFindAddress}>
                  주소 검색
                </Button>
              </div>
              <Input
                placeholder="상세 주소 (동·호수 등)"
                value={form.detailAddress}
                onChange={(e) => setForm({ ...form, detailAddress: e.target.value })}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '저장 중...' : '가입 완료'}
            </Button>

            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              가입 완료 시{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                이용약관
              </a>
              {' 및 '}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                개인정보처리방침
              </a>
              에 동의하는 것으로 간주되며, 입력하신 정보는 해당 방침에 따라 처리됩니다.
            </p>
          </form>

          {/* 다른 계정으로 로그인하려는 경우 탈출구 */}
          <div className="mt-4 border-t pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              다른 계정으로 로그인하시겠어요?
            </p>
            <Button
              type="button"
              variant="ghost"
              className="mt-1 h-auto p-1 text-sm"
              onClick={handleLogout}
              disabled={loading}
            >
              로그아웃
            </Button>
          </div>
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
