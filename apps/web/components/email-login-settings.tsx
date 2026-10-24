'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import { EmailCodeForm } from '@/components/email-code-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function EmailLoginSettings({ loginEmail, contactEmail, onChanged }: {
  loginEmail?: string | null;
  contactEmail?: string;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function unlink() {
    if (!confirm('이메일 로그인 연결을 해제하시겠습니까? 이후에는 연결된 소셜 계정으로 로그인해야 합니다.')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`${CONFIG.API_BASE}/auth/email/link`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '연결을 해제하지 못했습니다.');
      await onChanged();
      setMessage('이메일 로그인 연결을 해제했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결을 해제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>이메일 로그인</CardTitle>
        <CardDescription>공용 PC에서도 이메일 인증코드로 로그인하세요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loginEmail && !editing ? (
          <div className="space-y-3">
            <p className="text-sm break-all">{loginEmail}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={busy}
                onClick={() => { setEditing(true); setMessage(''); setError(''); }}>이메일 변경</Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={unlink}>연결 해제</Button>
            </div>
          </div>
        ) : (
          <>
            <EmailCodeForm key={loginEmail || 'new'} purpose="link"
              initialEmail={loginEmail || contactEmail || ''}
              onSuccess={async () => {
                await onChanged();
                setEditing(false);
                setError('');
                setMessage('이메일 로그인이 연결되었습니다.');
              }} />
            {editing && <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>취소</Button>}
          </>
        )}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
