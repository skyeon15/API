'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { CONFIG } from '@/lib/constants';
import { isProfileComplete } from '@/lib/profile';
import { resolvePostAuthDestination } from '@/lib/auth-redirect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const API_BASE = CONFIG.API_BASE;

interface ClientInfo {
  clientId: string;
  clientName: string;
  logoUrl?: string;
  primaryColor?: string;
}

function LoginForm() {
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);

  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const clientId = searchParams.get('client_id');
  const redirectPath = searchParams.get('redirect') || '/profile';

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
    if (authLoading || !user) return;

    // 필수정보(가입 완료) 미입력 시 가입 정보 입력 페이지로 유도 (OIDC 파라미터 보존)
    if (!isProfileComplete(user)) {
      const qs = searchParams.toString();
      router.replace(qs ? `/register?${qs}` : '/register');
      return;
    }

    const dest = resolvePostAuthDestination(
      searchParams as unknown as URLSearchParams,
      API_BASE,
    );
    if ('external' in dest) {
      // OIDC 흐름: 인증 코드를 받기 위해 API의 authorize 엔드포인트로 이동
      window.location.href = dest.external;
    } else {
      router.replace(dest.internal);
    }
  }, [user, authLoading, searchParams, router]);

  const handleSocialLogin = (provider: string) => {
    // 소셜 로그인 후 다시 이 페이지로 돌아오도록 설정 (redirect 파라미터 유지)
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set('redirect', redirectPath);
    window.location.href = `${API_BASE}/auth/${provider}?redirect=${encodeURIComponent(returnUrl.toString())}`;
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
            {clientInfo ? '계정으로 계속하려면 로그인하세요' : '소셜 계정으로 시작하세요'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 소셜 로그인 — 유일한 로그인 수단이다 */}
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

          {/* 의면적 동의 고지 */}
          <p className="text-xs text-center text-muted-foreground leading-relaxed">
            로그인 시{' '}
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
            에 동의하는 것으로 간주됩니다.
          </p>
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
