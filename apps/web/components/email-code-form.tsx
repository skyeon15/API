'use client';

import { useEffect, useId, useState } from 'react';
import { CONFIG } from '@/lib/constants';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  purpose?: 'login' | 'link';
  initialEmail?: string;
  onSuccess: () => void | Promise<void>;
}

export function EmailCodeForm({ purpose = 'login', initialEmail = '', onSuccess }: Props) {
  const id = useId();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<{ id: string; email: string; expiresAt: number } | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `${CONFIG.API_BASE}/auth/email${purpose === 'link' ? '/link' : ''}`;
  const send = purpose === 'link' ? apiFetch : fetch;

  useEffect(() => {
    let cancelled = false;
    fetch(`${CONFIG.API_BASE}/auth/email/status`, { cache: 'no-store' })
      .then(async (res) => res.ok && (await res.json()).enabled === true)
      .then((value) => { if (!cancelled) setEnabled(value); })
      .catch(() => { if (!cancelled) setEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!challenge && retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge, retryAt]);

  const retryIn = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const expiresIn = challenge ? Math.max(0, Math.ceil((challenge.expiresAt - now) / 1000)) : 0;

  async function post(path: string, body: Record<string, string>) {
    const response = await send(`${base}/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429 && Number.isFinite(data.retryAfter)) {
        setRetryAt(Date.now() + data.retryAfter * 1000);
        setNow(Date.now());
      }
      throw new Error(typeof data.message === 'string' ? data.message : '인증 요청에 실패했습니다.');
    }
    return data;
  }

  async function requestCode() {
    setBusy(true);
    setError('');
    try {
      const address = email.trim().toLowerCase();
      const data = await post('request', { email: address });
      setChallenge({ id: data.challengeId, email: address, expiresAt: Date.now() + data.expiresIn * 1000 });
      setRetryAt(Date.now() + data.retryAfter * 1000);
      setNow(Date.now());
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '인증 메일을 보내지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) { await requestCode(); return; }
    setBusy(true);
    setError('');
    try {
      await post('verify', { email: challenge.email, challengeId: challenge.id, code });
      setCode('');
      setChallenge(null);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '인증에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return <p className="text-sm text-muted-foreground">이메일 로그인을 준비하고 있습니다.</p>;
  if (!enabled) return <p className="text-sm text-muted-foreground">현재 이메일 인증을 사용할 수 없습니다. 다른 로그인 수단을 이용해주세요.</p>;

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`${id}-email`}>이메일</Label>
        <Input id={`${id}-email`} type="email" autoComplete="email" maxLength={254}
          placeholder="name@example.com" value={email} required
          readOnly={Boolean(challenge)} disabled={busy}
          onChange={(event) => setEmail(event.target.value)} />
      </div>
      {challenge && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-code`}>6자리 인증코드</Label>
          <Input id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" maxLength={6} value={code} required autoFocus disabled={busy}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
          <p className="text-xs text-muted-foreground" role="status">
            {expiresIn > 0 ? `메일로 보낸 코드를 입력해주세요. 남은 시간 ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, '0')}` : '인증코드가 만료되었습니다. 새 코드를 받아주세요.'}
          </p>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy || retryIn > 0}
              onClick={requestCode}>{retryIn > 0 ? `${retryIn}초 후 재전송` : '코드 재전송'}</Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy}
              onClick={() => { setChallenge(null); setCode(''); setError(''); }}>이메일 변경</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="submit"
        disabled={busy || (challenge ? code.length !== 6 || expiresIn === 0 : retryIn > 0)}>
        {busy ? '처리 중…' : challenge ? (purpose === 'link' ? '인증하고 연결하기' : '이메일로 로그인') : retryIn > 0 ? `${retryIn}초 후 다시 요청` : '인증코드 받기'}
      </Button>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {purpose === 'login'
          ? '휴대폰에서 메일을 확인하고 코드를 입력하세요. 처음 이용하는 이메일은 가입으로 이어집니다. 이메일 로그인은 1시간 뒤 만료되며, 공용 PC에서는 사용 후 로그아웃해주세요.'
          : '인증한 이메일로 소셜 로그인 없이 로그인할 수 있습니다. 프로필의 연락처 이메일과 별도로 관리됩니다.'}
      </p>
    </form>
  );
}
