'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getStripe } from '@/lib/stripe';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_BASE = CONFIG.API_BASE;
const DEFAULT_NEXT = '/manage';

// 오픈 리다이렉트 방지: 앱 내부 경로(단일 '/'로 시작)만 허용
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return DEFAULT_NEXT;
  return next;
}

/**
 * 리다이렉트형 결제수단(네이버페이 등) 복귀 콜백.
 * Stripe가 return_url로 붙여주는 setup_intent / payment_intent 파라미터를 읽어
 * 카드 저장 확정 또는 결제 결과 확인을 마친 뒤 원래 화면으로 돌려보낸다.
 * (카드 결제는 이탈이 없어 이 페이지를 거치지 않는다.)
 */
function StripeReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('결제사 응답을 확인하는 중입니다...');
  const handled = useRef(false);

  const next = safeNext(params.get('next'));
  const setupIntentSecret = params.get('setup_intent_client_secret');
  const paymentIntentSecret = params.get('payment_intent_client_secret');

  const goBack = useCallback(() => router.replace(next), [router, next]);

  useEffect(() => {
    // StrictMode 이중 실행 방지
    if (handled.current) return;
    handled.current = true;

    (async () => {
      const stripe = await getStripe();
      if (!stripe) {
        setStatus('error');
        setMessage('결제 모듈을 불러오지 못했습니다.');
        return;
      }

      try {
        if (setupIntentSecret) {
          const { setupIntent, error } = await stripe.retrieveSetupIntent(setupIntentSecret);
          if (error || !setupIntent) {
            throw new Error(error?.message || '결제수단 정보를 확인하지 못했습니다.');
          }
          if (setupIntent.status !== 'succeeded') {
            throw new Error(`결제수단 등록이 완료되지 않았습니다. (상태: ${setupIntent.status})`);
          }
          // 인라인 흐름과 동일하게 서버에 즉시 저장(웹훅은 백업)
          const res = await apiFetch(`${API_BASE}/profile/stripe/payment-methods`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ setupIntentId: setupIntent.id }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.message || '결제수단 저장에 실패했습니다.');
          }
          setStatus('success');
          setMessage('결제수단이 등록되었습니다.');
          return;
        }

        if (paymentIntentSecret) {
          const { paymentIntent, error } = await stripe.retrievePaymentIntent(paymentIntentSecret);
          if (error || !paymentIntent) {
            throw new Error(error?.message || '결제 정보를 확인하지 못했습니다.');
          }
          // 거래 상태 반영은 웹훅(payment_intent.succeeded)이 담당. 여기서는 결과만 안내.
          if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
            setStatus('success');
            setMessage(
              paymentIntent.status === 'succeeded'
                ? '결제가 완료되었습니다.'
                : '결제가 접수되었습니다. 승인 결과는 잠시 후 반영됩니다.',
            );
            return;
          }
          throw new Error(`결제가 완료되지 않았습니다. (상태: ${paymentIntent.status})`);
        }

        throw new Error('처리할 결제 정보가 없습니다.');
      } catch (err: any) {
        setStatus('error');
        setMessage(err?.message || '처리 중 오류가 발생했습니다.');
      }
    })();
  }, [setupIntentSecret, paymentIntentSecret]);

  // 성공 시 잠시 결과를 보여준 뒤 원래 화면으로 복귀
  useEffect(() => {
    if (status !== 'success') return;
    const timer = setTimeout(goBack, 1500);
    return () => clearTimeout(timer);
  }, [status, goBack]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {status === 'processing' && '처리 중'}
            {status === 'success' && '완료'}
            {status === 'error' && '실패'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'error' ? (
            <Alert variant="destructive">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
          {status !== 'processing' && (
            <Button onClick={goBack} className="w-full">
              돌아가기
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function StripeReturnPage() {
  return (
    <Suspense fallback={null}>
      <StripeReturn />
    </Suspense>
  );
}
