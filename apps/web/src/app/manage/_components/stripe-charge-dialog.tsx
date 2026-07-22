'use client';

import { useState } from 'react';
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
  DialogFooter,
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

interface StripeCard {
  id: number;
  cardName: string;
  cardNo: string;
  memo?: string | null;
  createdAt?: string;
}

// 저장된 Stripe 카드로 off_session 즉시 결제(/profile/stripe/charge).
export function StripeChargeDialog({
  cards,
  onPaid,
}: {
  cards: StripeCard[];
  onPaid: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    paymentMethodId: '',
    amount: '',
    currency: 'krw',
    goodName: '',
    memo: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setForm({ paymentMethodId: '', amount: '', currency: 'krw', goodName: '', memo: '' });
    setError('');
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(form.amount);
    if (!form.paymentMethodId || !amountNum || amountNum <= 0 || !form.goodName.trim()) {
      setError('카드, 금액, 상품명을 모두 입력해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`${API_BASE}/profile/stripe/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: form.paymentMethodId,
          amount: toMinorUnit(amountNum, form.currency),
          currency: form.currency,
          goodName: form.goodName.trim(),
          memo: form.memo.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || '결제에 실패했습니다.');
      }
      // 3DS 재인증이 필요한 카드는 off_session 청구에서 FAILED로 기록된다.
      if (data?.status !== 'paid') {
        throw new Error(
          '결제가 완료되지 않았습니다. 카드 인증이 필요할 수 있으니 일회성 결제로 진행해주세요.',
        );
      }
      setOpen(false);
      reset();
      onPaid();
    } catch (err: any) {
      setError(err?.message || '결제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const selected = cards.find((c) => String(c.id) === form.paymentMethodId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button variant="outline" className="w-full" disabled={cards.length === 0} />}
      >
        {cards.length === 0
          ? 'Stripe 카드를 먼저 등록하세요'
          : 'Stripe 저장 카드로 결제'}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stripe 저장 카드 결제</DialogTitle>
          <DialogDescription>
            등록해 둔 Stripe 카드로 즉시 결제합니다. (off_session)
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="my-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="stripe-charge-card">결제 카드</Label>
            <select
              id="stripe-charge-card"
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              value={form.paymentMethodId}
              onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}
            >
              <option value="">선택</option>
              {cards.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.cardName} {c.cardNo}
                  {c.createdAt
                    ? ` · 등록 ${new Date(c.createdAt).toLocaleDateString('ko-KR')}`
                    : ''}
                </option>
              ))}
            </select>
            {selected?.memo && (
              <p className="text-xs text-muted-foreground">메모: {selected.memo}</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="stripe-charge-amount">결제 금액</Label>
              <Input
                id="stripe-charge-amount"
                type="number"
                min="1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="10000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stripe-charge-currency">통화</Label>
              <select
                id="stripe-charge-currency"
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
            <Label htmlFor="stripe-charge-goodName">상품명</Label>
            <Input
              id="stripe-charge-goodName"
              value={form.goodName}
              onChange={(e) => setForm({ ...form, goodName: e.target.value })}
              placeholder="결제 상품명"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stripe-charge-memo">메모 (선택)</Label>
            <Input
              id="stripe-charge-memo"
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? '결제 중...' : '결제 요청'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
