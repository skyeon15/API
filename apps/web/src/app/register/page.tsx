'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import { isProfileComplete } from '@/lib/profile';
import { resolvePostAuthDestination } from '@/lib/auth-redirect';
import { openPostcodeSearch } from '@/lib/postcode';
import {
  StripeAddressField,
  type OverseasAddress,
} from './_components/stripe-address-field';
import {
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  splitPhone,
  toE164,
  type CountryCode,
} from '@/lib/phone';
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
    addressCountry: '',
    addressCity: '',
    addressState: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 전화번호는 로그인 수단이 아니라 연락처다 — 문자 인증 없이 입력값을 그대로 저장한다.
  // 국가는 저장 형식(국내 표기 / E.164)을 가르므로 따로 받는다.
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const e164 = toE164(country, form.phone);

  // 주소: 국내는 다음 우편번호(도로명주소·5자리 우편번호가 정확하다), 그 밖의 나라는
  // Stripe Address Element. 해외 주소는 국가별 필수 항목이 달라 Stripe 의 완료 판정을 그대로 쓴다.
  const [overseasAddress, setOverseasAddress] = useState(false);
  const [overseasComplete, setOverseasComplete] = useState(false);

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
    // 저장된 번호는 (국가, 국내표기)로 되돌려 채운다 — 해외 번호는 E.164 로 저장돼 있다.
    const stored = user.phone ? splitPhone(user.phone) : null;
    if (stored) setCountry(stored.country);
    if (user.addressCountry && user.addressCountry !== 'KR') setOverseasAddress(true);

    // 소셜/휴대폰 로그인에서 받아온 값 선채움 (사용자가 이미 입력한 값은 덮어쓰지 않는다)
    setForm((prev) => ({
      ...prev,
      name: prev.name || user.name || '',
      nickname: prev.nickname || user.nickname || '',
      email: prev.email || user.email || '',
      phone: stored ? stored.national : prev.phone,
      birthDate: prev.birthDate || user.birthDate || '',
      gender: prev.gender || user.gender || '',
      zipCode: prev.zipCode || user.zipCode || '',
      address: prev.address || user.address || '',
      detailAddress: prev.detailAddress || user.detailAddress || '',
      addressCountry: prev.addressCountry || user.addressCountry || '',
      addressCity: prev.addressCity || user.addressCity || '',
      addressState: prev.addressState || user.addressState || '',
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

  const handleFindAddress = async () => {
    try {
      const picked = await openPostcodeSearch();
      // 그냥 닫은 경우다. 적어 두던 상세 주소를 지우지 않는다.
      if (!picked) return;
      setForm((f) => ({
        ...f,
        zipCode: picked.zonecode,
        address: picked.address,
        addressCountry: 'KR',
        addressCity: '',
        addressState: '',
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '주소를 찾지 못했어요.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!e164) {
      setError('전화번호를 정확히 입력해주세요.');
      return;
    }

    const missing =
      !form.name.trim() ||
      !form.gender ||
      !form.birthDate ||
      !form.email.trim();
    if (missing) {
      setError('필수 항목을 모두 입력해주세요.');
      return;
    }
    // 주소는 선택이지만, 적기 시작했다면 끝까지 받아야 쓸 수 있는 주소가 된다.
    // 해외 주소의 완료 판정은 나라마다 필수 칸이 달라 Stripe 의 것을 그대로 따른다.
    if (overseasAddress && form.address.trim() && !overseasComplete) {
      setError('주소를 끝까지 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, phone: e164 }),
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
                <Label htmlFor="nickname">닉네임 *</Label>
                <Input
                  id="nickname"
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="비워두면 이름으로 채워집니다"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="phone">전화번호 *</Label>
                <div className="flex gap-2">
                  <select
                    aria-label="국가"
                    className="h-10 w-40 shrink-0 px-2 rounded-md border border-input bg-background text-sm"
                    value={country}
                    onChange={(e) => setCountry(e.target.value as CountryCode)}
                  >
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name} +{c.callingCode}
                      </option>
                    ))}
                  </select>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder={country === DEFAULT_COUNTRY ? '010-1234-5678' : '전화번호'}
                    className="flex-1"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  주문·배송 안내를 받을 연락처입니다.
                </p>
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
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value="U"
                      checked={form.gender === 'U'}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    />{' '}
                    선택안함
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>주소 <span className="text-muted-foreground font-normal">(선택)</span></Label>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto p-0 text-xs underline text-muted-foreground"
                  onClick={() => {
                    // 입력 방식을 바꾸면 앞서 넣은 주소는 형식이 달라 남겨 둘 수 없다.
                    setOverseasAddress((v) => !v);
                    setOverseasComplete(false);
                    setForm((f) => ({
                      ...f,
                      zipCode: '',
                      address: '',
                      detailAddress: '',
                      addressCountry: '',
                      addressCity: '',
                      addressState: '',
                    }));
                  }}
                >
                  {overseasAddress ? '국내 주소 입력하기' : '해외 주소 입력하기'}
                </Button>
              </div>

              {overseasAddress ? (
                <StripeAddressField
                  defaultValue={{
                    line1: form.address,
                    line2: form.detailAddress,
                    city: form.addressCity,
                    state: form.addressState,
                    postalCode: form.zipCode,
                    country: form.addressCountry,
                  }}
                  onChange={(addr: OverseasAddress, complete) => {
                    setOverseasComplete(complete);
                    setForm((f) => ({
                      ...f,
                      address: addr.line1,
                      detailAddress: addr.line2,
                      addressCity: addr.city,
                      addressState: addr.state,
                      zipCode: addr.postalCode,
                      addressCountry: addr.country,
                    }));
                  }}
                />
              ) : (
                <>
                  {/* 우편번호와 기본 주소는 검색으로만 넣는다 — 손으로 적으면 표기가 제각각이 되고
                      5자리를 틀리면 배송이 안 간다. 상세 주소만 직접 적는다. */}
                  <div className="flex gap-2">
                    <Input placeholder="우편번호" className="w-24" value={form.zipCode} readOnly />
                    <Input
                      placeholder="주소 검색을 눌러 주세요"
                      className="flex-1"
                      value={form.address}
                      readOnly
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
                </>
              )}
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
