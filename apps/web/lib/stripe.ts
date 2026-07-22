import { loadStripe, type Stripe } from '@stripe/stripe-js';

// Stripe.js 싱글톤 로더. publishable 키는 공개키라 클라이언트 노출 OK.
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY 가 설정되지 않았습니다.');
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

// 리다이렉트형 결제수단(네이버페이 등) 복귀용 콜백 URL.
// next 는 처리 완료 후 돌아갈 앱 내부 경로(오픈 리다이렉트 방지를 위해 '/'로 시작해야 함).
export const STRIPE_RETURN_PATH = '/stripe/return';

export function stripeReturnUrl(next: string): string {
  const url = new URL(STRIPE_RETURN_PATH, window.location.origin);
  url.searchParams.set('next', next);
  return url.toString();
}
