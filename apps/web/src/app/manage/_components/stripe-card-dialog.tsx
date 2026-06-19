'use client';

import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/stripe';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import { Button } from '@/components/ui/button';
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

// SetupIntent client_secret 을 받은 뒤 카드 입력 → confirmSetup → 백엔드 즉시 저장
function CardForm({ onSaved }: { onSaved: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || '카드 인증에 실패했습니다.');
      setSubmitting(false);
      return;
    }
    if (setupIntent?.status !== 'succeeded') {
      setError('카드 인증이 완료되지 않았습니다.');
      setSubmitting(false);
      return;
    }

    // 확정된 SetupIntent 로 서버에 카드 저장(웹훅은 백업)
    try {
      const res = await apiFetch(`${API_BASE}/profile/stripe/payment-methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupIntentId: setupIntent.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || '카드 저장에 실패했습니다.');
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message || '카드 저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
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
        {submitting ? '등록 중...' : '카드 등록'}
      </Button>
    </form>
  );
}

export function StripeCardDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next && !clientSecret) {
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch(`${API_BASE}/profile/stripe/setup-intent`, {
          method: 'POST',
        });
        const data = await res.json();
        if (!res.ok || !data?.clientSecret) {
          throw new Error(data?.message || 'SetupIntent 발급에 실패했습니다.');
        }
        setClientSecret(data.clientSecret);
      } catch (err: any) {
        setError(err?.message || 'Stripe 초기화에 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }
    if (!next) {
      // 닫을 때 초기화하여 다음 열람 시 새 SetupIntent 발급
      setClientSecret('');
      setError('');
    }
  };

  const handleSaved = () => {
    setOpen(false);
    setClientSecret('');
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>
        Stripe 카드 등록 (해외/정기결제)
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stripe 카드 등록</DialogTitle>
          <DialogDescription>
            카드 정보는 Stripe로 직접 전송되며 서버에 저장되지 않습니다.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="my-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            결제 모듈을 불러오는 중...
          </p>
        )}
        {clientSecret && (
          <Elements stripe={getStripe()} options={{ clientSecret }}>
            <CardForm onSaved={handleSaved} />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
