'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const API_BASE = CONFIG.API_BASE;

type ClientAdmin = {
  userId: string;
  name: string | null;
  nickname: string | null;
  email: string | null;
  createdAt: string;
};

/**
 * 서비스(SSO 클라이언트)별 관리자 목록.
 *
 * 플랫폼 전체 관리자(users.roles 의 ADMIN)와 다르다 — 여기서 지정한 사람은 «그 서비스
 * 안에서만» 관리자이고, 연동 서비스는 `GET /auth/userinfo` 의 `isServiceAdmin` 으로 읽는다.
 * 지정 자체는 플랫폼 ADMIN 만 할 수 있다(API 가 @Roles(ADMIN) 로 막혀 있다).
 */
export function SsoClientAdmins({ clientRowId }: { clientRowId: string }) {
  const [admins, setAdmins] = useState<ClientAdmin[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await apiFetch(`${API_BASE}/auth/clients/${clientRowId}/admins`);
    if (res.ok) setAdmins(await res.json());
  }, [clientRowId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch(
        `${API_BASE}/auth/clients/${clientRowId}/admins`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '관리자를 추가하지 못했습니다.');
      }
      setAdmins(await res.json());
      setEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '관리자를 추가하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string) => {
    const res = await apiFetch(
      `${API_BASE}/auth/clients/${clientRowId}/admins/${userId}`,
      { method: 'DELETE' },
    );
    if (res.ok) setAdmins(await res.json());
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        서비스 관리자{' '}
        <span className="opacity-70">
          — userinfo 의 isServiceAdmin 으로 내려갑니다
        </span>
      </p>

      {admins.length > 0 && (
        <div className="space-y-1 mb-2">
          {admins.map((admin) => (
            <div
              key={admin.userId}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {admin.name || admin.nickname || '(이름 없음)'}
                <span className="text-xs text-muted-foreground ml-2">
                  {admin.email}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => remove(admin.userId)}
              >
                해제
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          className="h-8 text-sm"
          placeholder="추가할 사용자 이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={add}
          disabled={busy}
        >
          {busy ? '추가 중...' : '추가'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
