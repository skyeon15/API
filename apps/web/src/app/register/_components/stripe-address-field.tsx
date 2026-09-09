'use client';

import { Elements, AddressElement } from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/stripe';

export type OverseasAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

/**
 * 해외 주소 입력.
 *
 * 다음 우편번호는 국내 주소만 주므로 그 밖의 나라는 Stripe Address Element 로 받는다.
 * 이미 쓰고 있는 Stripe.js 를 그대로 쓰는 것이라 새 의존성이 없고, 236개국 주소 형식과
 * 국가별 필수 항목 검증이 딸려 온다.
 *
 * 결제와 무관하게 단독으로 mount 하므로 `clientSecret` 이 필요 없다. 다만 그 경우
 * 구글 주소 자동완성은 켜지지 않는다(자체 Google Maps 키가 있어야 한다) — 자동완성이
 * 없어도 수동 입력은 정상 동작한다.
 */
export function StripeAddressField({
  defaultValue,
  onChange,
}: {
  defaultValue?: Partial<OverseasAddress>;
  onChange: (address: OverseasAddress, complete: boolean) => void;
}) {
  return (
    <Elements stripe={getStripe()}>
      <AddressElement
        options={{
          // 이름·전화는 위에서 따로 받으므로 주소만 받는다.
          mode: 'billing',
          fields: { phone: 'never' },
          defaultValues: defaultValue
            ? {
                address: {
                  line1: defaultValue.line1 ?? '',
                  line2: defaultValue.line2 ?? '',
                  city: defaultValue.city ?? '',
                  state: defaultValue.state ?? '',
                  postal_code: defaultValue.postalCode ?? '',
                  country: defaultValue.country || 'US',
                },
              }
            : undefined,
        }}
        onChange={(event) => {
          const a = event.value.address;
          onChange(
            {
              line1: a.line1 ?? '',
              line2: a.line2 ?? '',
              city: a.city ?? '',
              state: a.state ?? '',
              postalCode: a.postal_code ?? '',
              country: a.country ?? '',
            },
            event.complete,
          );
        }}
      />
    </Elements>
  );
}
