'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { CONFIG } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_BASE = CONFIG.API_BASE;

interface ClientInfo {
  clientId: string;
  clientName: string;
  logoUrl?: string;
  primaryColor?: string;
}

function LoginForm() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);

  const { user, loading: authLoading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const scope = searchParams.get('scope') || 'openid profile';
  const state = searchParams.get('state') || '';

  // 1. 클라이언트 정보(브랜딩) 가져오기
  useEffect(() => {
    if (clientId) {
      fetch(`${API_BASE}/auth/client/${clientId}`)
        .then((res) => res.json())
        .then((data) => {
          setClientInfo(data);
          // 동적 테마 적용 (CSS 변수 변경)
          if (data.primaryColor) {
            document.documentElement.style.setProperty('--primary', data.primaryColor);
          }
        })
        .catch(console.error);
    }
  }, [clientId]);

  // 2. 로그인 성공 시 처리
  useEffect(() => {
    if (!authLoading && user) {
      if (clientId && redirectUri) {
        // OIDC 흐름: 인증 코드를 받기 위해 API의 authorize 엔드포인트로 이동
        const authUrl = new URL(`${API_BASE}/auth/authorize`);
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', scope);
        authUrl.searchParams.set('state', state);
        window.location.href = authUrl.toString();
      } else {
        router.replace('/profile');
      }
    }
  }, [user, authLoading, clientId, redirectUri, scope, state, router]);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) throw new Error('인증번호 요청에 실패했습니다.');
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(phone, code);
      // useEffect에서 리다이렉트 처리됨
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider: string) => {
    // 소셜 로그인 후 다시 이 페이지로 돌아오도록 설정
    const currentUrl = encodeURIComponent(window.location.href);
    window.location.href = `${API_BASE}/auth/${provider}?redirect=${currentUrl}`;
  };

  if (authLoading || user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {clientInfo?.logoUrl ? (
            <img src={clientInfo.logoUrl} alt={clientInfo.clientName} className="h-12 mx-auto mb-4" />
          ) : (
            <div className="w-12 h-12 bg-primary rounded-full mx-auto mb-4 flex items-center justify-center text-white font-bold">
              ID
            </div>
          )}
          <CardTitle className="text-2xl">
            {clientInfo ? `${clientInfo.clientName} 로그인` : '로그인'}
          </CardTitle>
          <CardDescription>
            {clientInfo ? '계정으로 계속하려면 로그인하세요' : '휴대폰 번호로 시작하세요'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 1. 소셜 로그인 버튼들 */}
          <div className="grid grid-cols-1 gap-2">
            <Button
              variant="outline"
              className="bg-[#FEE500] text-[#191919] border-none hover:bg-[#FEE500]/90"
              onClick={() => handleSocialLogin('kakao')}
            >
              카카오로 시작하기
            </Button>
            <Button
              variant="outline"
              className="bg-[#03C75A] text-white border-none hover:bg-[#03C75A]/90"
              onClick={() => handleSocialLogin('naver')}
            >
              네이버로 시작하기
            </Button>
            <Button
              variant="outline"
              className="bg-white text-gray-700 border hover:bg-gray-50"
              onClick={() => handleSocialLogin('google')}
            >
              Google로 시작하기
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">또는 휴대폰 인증</span>
            </div>
          </div>

          {/* 2. 휴대폰 번호 인증 폼 */}
          {step === 1 ? (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">휴대폰 번호</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="010-1234-5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '요청 중...' : '인증번호 받기'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">인증번호</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="6자리 숫자"
                  maxLength={6}
                  className="text-center text-xl tracking-widest"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '확인 중...' : '로그인'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={() => setStep(1)}
              >
                다시 입력하기
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
