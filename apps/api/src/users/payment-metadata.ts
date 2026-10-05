/** Immutable payment-time display metadata. Excludes card numbers, billing keys and PG credentials. */
export type ActualPaymentMethod = {
  type: string;
  provider?: string;
  cardName?: string;
  cardBrand?: string;
  cardType?: 'CREDIT' | 'DEBIT';
  installmentMonths?: number;
  fundingType?: 'CARD' | 'TRANSFER' | 'CHARGE';
};

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 80)
    : undefined;
function months(value: unknown): number | undefined {
  if (
    typeof value !== 'number' &&
    !(typeof value === 'string' && /^\d{1,2}$/.test(value))
  )
    return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 60
    ? parsed
    : undefined;
}

/** The caller must establish that this is an approval, not a payment-window request. */
export function payappPaymentMetadata(
  value: unknown,
): ActualPaymentMethod | null {
  const body = record(value);
  const payType = String(body.pay_type);
  const types: Record<string, string> = {
    '1': 'CARD',
    '2': 'MOBILE',
    '4': 'FACE_TO_FACE',
    '6': 'TRANSFER',
    '7': 'VIRTUAL_ACCOUNT',
    '15': 'EASY_PAY',
    '16': 'EASY_PAY',
    '17': 'REGISTERED',
    '21': 'EASY_PAY',
    '22': 'EASY_PAY',
    '23': 'EASY_PAY',
    '24': 'TRANSFER',
    '25': 'EASY_PAY',
    '26': 'EASY_PAY',
  };
  const type = types[payType];
  if (!type) return null;
  const result: ActualPaymentMethod = { type };
  const providers: Record<string, string> = {
    '15': 'KAKAOPAY',
    '16': 'NAVERPAY',
    '21': 'SMILEPAY',
    '22': 'WECHAT',
    '23': 'APPLEPAY',
    '24': 'MYACCOUNT',
    '25': 'TOSSPAY',
    '26': 'NANAPAY',
  };
  if (providers[payType]) result.provider = providers[payType];
  if (payType === '1' && String(body.paymethod_group) === '35') {
    result.type = 'EASY_PAY';
    result.provider = 'PAYCO';
    result.fundingType = 'CARD';
  }
  if (
    payType === '16' &&
    (body.naverpay === 'card' || body.naverpay === 'bank')
  ) {
    result.fundingType = body.naverpay === 'card' ? 'CARD' : 'TRANSFER';
  }
  if (
    ['CARD', 'FACE_TO_FACE', 'REGISTERED', 'EASY_PAY'].includes(result.type)
  ) {
    const cardName = text(body.card_name);
    if (cardName) {
      result.cardName = cardName;
      if (result.type === 'EASY_PAY' && !result.fundingType)
        result.fundingType = 'CARD';
    }
    if (result.type !== 'EASY_PAY' || result.fundingType === 'CARD') {
      const installment = months(body.card_quota);
      if (installment !== undefined) result.installmentMonths = installment;
    }
  }
  return result;
}

export function approvedPayappMetadata(
  rawResponse: unknown,
  mulNo?: string | null,
): ActualPaymentMethod | null {
  const webhooks = record(rawResponse).webhooks;
  if (!Array.isArray(webhooks)) return null;
  const approval = [...webhooks]
    .reverse()
    .map(record)
    .find(
      (body) =>
        String(body.pay_state) === '4' &&
        (!mulNo || String(body.mul_no) === mulNo),
    );
  return approval ? payappPaymentMetadata(approval) : null;
}

/** Charge details describe the completed payment; configured/saved payment options do not. */
export function stripeChargeMetadata(
  value: unknown,
  expected?: { paymentIntentId: string; amount: number; currency: string },
): ActualPaymentMethod | null {
  const charge = record(value);
  if (charge.paid !== true || charge.status !== 'succeeded') return null;
  if (expected) {
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : record(charge.payment_intent).id;
    if (
      paymentIntentId !== expected.paymentIntentId ||
      charge.amount !== expected.amount ||
      charge.currency !== expected.currency
    )
      return null;
  }
  const details = record(charge.payment_method_details);
  const stripeType = text(details.type);
  if (!stripeType || !/^[a-z][a-z0-9_]*$/.test(stripeType)) return null;
  const wallets: Record<string, string> = {
    naver_pay: 'NAVERPAY',
    kakao_pay: 'KAKAOPAY',
    payco: 'PAYCO',
    samsung_pay: 'SAMSUNGPAY',
    apple_pay: 'APPLEPAY',
    google_pay: 'GOOGLEPAY',
    link: 'LINK',
    paypal: 'PAYPAL',
  };
  const result: ActualPaymentMethod = {
    type: wallets[stripeType] ? 'EASY_PAY' : stripeType.toUpperCase(),
  };
  if (wallets[stripeType]) result.provider = wallets[stripeType];
  if (stripeType === 'card') {
    const card = record(details.card);
    const wallet = wallets[String(record(card.wallet).type)];
    if (wallet) {
      result.type = 'EASY_PAY';
      result.provider = wallet;
      result.fundingType = 'CARD';
    }
    const brand = text(card.brand);
    if (brand) result.cardBrand = brand;
    if (card.funding === 'credit' || card.funding === 'debit')
      result.cardType = card.funding === 'credit' ? 'CREDIT' : 'DEBIT';
    if (card.installments === null) result.installmentMonths = 0;
    else {
      const plan = record(record(card.installments).plan);
      const installment =
        plan.interval === 'month' ? months(plan.count) : undefined;
      if (installment !== undefined && installment > 0)
        result.installmentMonths = installment;
    }
  }
  return result;
}

/** Supplement missing information without changing the original approved method. */
export function mergePaymentMetadata(
  current: ActualPaymentMethod | null | undefined,
  incoming: ActualPaymentMethod | null,
): ActualPaymentMethod | null {
  if (!current) return incoming;
  const registeredCard =
    incoming &&
    [current.type, incoming.type].every((type) =>
      ['CARD', 'REGISTERED'].includes(type),
    );
  if (
    !incoming ||
    (current.type !== incoming.type && !registeredCard) ||
    (current.provider &&
      incoming.provider &&
      current.provider !== incoming.provider)
  )
    return current;
  return { ...incoming, ...current };
}

/** Backfill only the original recorded approval; never reconstruct old payments from today's saved card. */
export function recordedPaymentMetadata(tx: {
  provider: string;
  paidAt: unknown;
  payMethod?: string;
  mulNo?: string | null;
  stripePaymentIntentId?: string | null;
  amount: number;
  currency: string;
  rawResponse: unknown;
}): ActualPaymentMethod | null {
  if (!tx.paidAt) return null;
  const raw = record(tx.rawResponse);
  if (tx.provider === 'payapp') {
    const approval = approvedPayappMetadata(raw, tx.mulNo);
    if (approval) return approval;
    // A successful billPay response proves a registered card charge, but may omit issuer/instalments.
    if (tx.payMethod === 'billing' && String(raw.state) === '1') {
      const result: ActualPaymentMethod = { type: 'CARD' };
      const cardName = text(raw.card_name);
      if (cardName) result.cardName = cardName;
      const installment = months(raw.card_quota);
      if (installment !== undefined) result.installmentMonths = installment;
      return result;
    }
    return null;
  }
  if (tx.provider === 'stripe') {
    const pi = record(raw.paymentIntent);
    if (
      pi.status !== 'succeeded' ||
      pi.id !== tx.stripePaymentIntentId ||
      pi.amount !== tx.amount ||
      pi.currency !== tx.currency
    )
      return null;
    return stripeChargeMetadata(pi.latest_charge, {
      paymentIntentId: String(pi.id),
      amount: tx.amount,
      currency: tx.currency,
    });
  }
  return null;
}
