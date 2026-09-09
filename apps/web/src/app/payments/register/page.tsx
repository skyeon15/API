'use client';

/**
 * 연동 서비스의 정기결제 카드 등록 화면.
 *
 * 🔴 **이 화면이 있는 이유는 카드번호를 연동 서비스가 만지지 않게 하려는 것**이다.
 *    PayApp 빌링키 발급(`billRegist`)은 결제창이 아니라 카드번호를 그대로 받는 API 라,
 *    서비스가 자기 폼으로 받으면 그 서비스의 서버·로그가 카드정보 취급 범위에 들어간다.
 *    서비스는 사용자를 여기로 보내기만 하고, 끝나면 `return_url` 로 돌아간다.
 *
 * 들어오는 주소: `/payments/register?client_id=...&return_url=...[&mode=popup]`
 * 복귀 주소는 **서버가 검증한 것만** 쓴다(오픈 리다이렉트 차단, `register-context`).
 *
 * 🔴 **`mode=popup` 은 iframe 을 못 쓰기 때문에 있다.** 연동 서비스가 카드 등록을 자기
 *    화면 안에 담고 싶어도 iframe 은 막다른 길이다 — 플랫폼 세션 쿠키가 `SameSite=Lax` 라
 *    크로스사이트 프레임에는 실리지 않고, 그래서 언제나 로그인 화면이 뜨는데 소셜 로그인
 *    (구글·카카오)은 자기들이 프레임 안에서의 로그인을 막는다. 팝업은 **최상위 창**이라
 *    쿠키가 1st-party 로 붙고 소셜 로그인도 정상이다.
 *    끝나면 `window.opener` 에 결과를 알리고 스스로 닫는다.
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const API_BASE = CONFIG.API_BASE;

interface RegisterContext {
  clientId: string;
  clientName: string;
  logoUrl: string | null;
  primaryColor?: string;
  billingEnabled: boolean;
  returnUrl: string | null;
}

const formatCardNo = (v: string) =>
  v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');

function RegisterCardForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const clientId = searchParams.get('client_id') ?? '';
  const returnUrlParam = searchParams.get('return_url') ?? '';
  // 팝업으로 불렸는가. 창을 닫아도 되는지가 여기서 갈린다
  const isPopup = searchParams.get('mode') === 'popup';

  const [ctx, setCtx] = useState<RegisterContext | null>(null);
  const [ctxError, setCtxError] = useState('');
  const [card, setCard] = useState({
    cardNo: '',
    expMonth: '',
    expYear: '',
    cardPw: '',
    buyerAuthNo: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 로그인이 없으면 플랫폼 로그인부터. 끝나면 이 주소로 그대로 돌아온다.
  useEffect(() => {
    if (authLoading || user) return;
    const here = `/payments/register?${searchParams.toString()}`;
    const qs = new URLSearchParams({ redirect: here });
    if (clientId) qs.set('client_id', clientId);
    router.replace(`/login?${qs.toString()}`);
  }, [authLoading, user, clientId, searchParams, router]);

  useEffect(() => {
    if (!clientId) {
      setCtxError('어느 서비스의 카드인지 알 수 없습니다.');
      return;
    }
    const qs = new URLSearchParams({ clientId });
    if (returnUrlParam) qs.set('returnUrl', returnUrlParam);
    fetch(`${API_BASE}/sso/payments/register-context?${qs.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || '서비스 정보를 불러오지 못했습니다.');
        return data as RegisterContext;
      })
      .then(setCtx)
      .catch((e: Error) => setCtxError(e.message));
  }, [clientId, returnUrlParam]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanCardNo = card.cardNo.replace(/\D/g, '');
    if (cleanCardNo.length < 15) {
      setError('카드 번호가 올바르지 않습니다.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/sso/payments/methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientId,
          cardNo: cleanCardNo,
          expMonth: card.expMonth,
          expYear: card.expYear,
          cardPw: card.cardPw,
          buyerAuthNo: card.buyerAuthNo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '카드 등록에 실패했습니다.');

      // 카드번호는 화면을 떠나기 전에 지운다(뒤로 가기로 폼이 되살아나는 것을 막는다).
      setCard({ cardNo: '', expMonth: '', expYear: '', cardPw: '', buyerAuthNo: '' });

      // 팝업으로 열렸으면 부른 쪽에 알리고 닫는다. 🔴 보내는 곳은 **서버가 검증한**
      // 복귀 주소의 출처뿐이다 — `'*'` 로 뿌리면 아무 페이지나 이 결과를 주워 간다.
      const opener = isPopup ? window.opener : null;
      if (opener && ctx?.returnUrl) {
        opener.postMessage(
          { type: 'bbf:card-registered', paymentMethodId: data?.id ?? null },
          new URL(ctx.returnUrl).origin,
        );
        window.close();
        return;
      }
      if (ctx?.returnUrl) {
        window.location.href = ctx.returnUrl;
      } else {
        router.replace('/profile');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '카드 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user) return null;

  if (ctxError || (ctx && !ctx.billingEnabled)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>카드를 등록할 수 없습니다</CardTitle>
            <CardDescription>
              {ctxError || '이 서비스는 아직 정기결제를 받을 준비가 되지 않았습니다.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>결제 카드 등록</CardTitle>
          <CardDescription>
            {ctx ? `${ctx.clientName} 의 정기결제에 쓸 카드입니다.` : ' '}
            <br />
            카드 정보는 파란대나무숲과 PayApp 만 받습니다. 서비스에는 전달되지 않습니다.
          </CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cardNo">카드 번호</Label>
              <Input
                id="cardNo"
                inputMode="numeric"
                autoComplete="cc-number"
                value={card.cardNo}
                onChange={(e) => setCard({ ...card, cardNo: formatCardNo(e.target.value) })}
                placeholder="0000 0000 0000 0000"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expMonth">유효기간 월 (MM)</Label>
                <Input
                  id="expMonth"
                  inputMode="numeric"
                  autoComplete="cc-exp-month"
                  value={card.expMonth}
                  onChange={(e) =>
                    setCard({ ...card, expMonth: e.target.value.replace(/\D/g, '').slice(0, 2) })
                  }
                  placeholder="01"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expYear">유효기간 년 (YY)</Label>
                <Input
                  id="expYear"
                  inputMode="numeric"
                  autoComplete="cc-exp-year"
                  value={card.expYear}
                  onChange={(e) =>
                    setCard({ ...card, expYear: e.target.value.replace(/\D/g, '').slice(0, 2) })
                  }
                  placeholder="30"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cardPw">비밀번호 앞 2자리</Label>
                <Input
                  id="cardPw"
                  type="password"
                  inputMode="numeric"
                  value={card.cardPw}
                  onChange={(e) =>
                    setCard({ ...card, cardPw: e.target.value.replace(/\D/g, '').slice(0, 2) })
                  }
                  placeholder="**"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buyerAuthNo">생년월일 6자리</Label>
                <Input
                  id="buyerAuthNo"
                  inputMode="numeric"
                  value={card.buyerAuthNo}
                  onChange={(e) =>
                    setCard({ ...card, buyerAuthNo: e.target.value.replace(/\D/g, '').slice(0, 10) })
                  }
                  placeholder="900101"
                  required
                />
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <Button type="submit" disabled={submitting || !ctx}>
              {submitting ? '등록하는 중…' : '카드 등록하기'}
            </Button>
            <p className="text-xs text-muted-foreground">
              등록만으로는 결제되지 않습니다. 실제 청구는 서비스가 요금을 받을 때 이루어집니다.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function RegisterCardPage() {
  return (
    <Suspense fallback={null}>
      <RegisterCardForm />
    </Suspense>
  );
}
