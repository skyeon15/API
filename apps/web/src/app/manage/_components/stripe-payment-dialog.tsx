'use client';

import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/stripe';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const API_BASE = CONFIG.API_BASE;

// 0 소수 통화(원/엔 등)는 입력 단위 = 최소 단위. 그 외(usd 등)는 ×100(센트).
const ZERO_DECIMAL = new Set(['krw', 'jpy', 'vnd', 'clp']);

function toMinorUnit(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}

function ConfirmForm({ onPaid }: { onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || '결제에 실패했습니다.');
      setSubmitting(false);
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      onPaid();
      return;
    }
    setError(`결제가 완료되지 않았습니다. (상태: ${paymentIntent?.status})`);
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <PaymentElement />
      <Button type="submit" disabled={!stripe || submitting} className="w-full">
        {submitting ? '결제 중...' : '결제하기'}
      </Button>
    </form>
  );
}

export function StripePaymentDialog({ onPaid }: { onPaid: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: '', currency: 'krw', goodName: '' });
  const [clientSecret, setClientSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setForm({ amount: '', currency: 'krw', goodName: '' });
    setClientSecret('');
    setError('');
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleCreateIntent = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(form.amount);
    if (!amountNum || amountNum <= 0 || !form.goodName.trim()) {
      setError('금액과 상품명을 입력해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`${API_BASE}/profile/stripe/payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: toMinorUnit(amountNum, form.currency),
          currency: form.currency,
          goodName: form.goodName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.clientSecret) {
        throw new Error(data?.message || 'PaymentIntent 발급에 실패했습니다.');
      }
      setClientSecret(data.clientSecret);
    } catch (err: any) {
      setError(err?.message || 'Stripe 초기화에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handlePaid = () => {
    setOpen(false);
    reset();
    onPaid();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>
        Stripe 결제 (일회성)
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stripe 일회성 결제</DialogTitle>
          <DialogDescription>
            금액과 통화를 입력한 뒤 카드 정보로 결제합니다.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="my-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!clientSecret ? (
          <form onSubmit={handleCreateIntent} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="stripe-amount">금액</Label>
                <Input
                  id="stripe-amount"
                  type="number"
                  min="1"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="10000"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stripe-currency">통화</Label>
                <select
                  id="stripe-currency"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="krw">KRW</option>
                  <option value="usd">USD</option>
                  <option value="jpy">JPY</option>
                  <option value="eur">EUR</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stripe-goodName">상품명</Label>
              <Input
                id="stripe-goodName"
                value={form.goodName}
                onChange={(e) => setForm({ ...form, goodName: e.target.value })}
                placeholder="결제 상품명"
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? '준비 중...' : '다음 (카드 입력)'}
            </Button>
          </form>
        ) : (
          <Elements stripe={getStripe()} options={{ clientSecret }}>
            <ConfirmForm onPaid={handlePaid} />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
