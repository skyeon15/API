'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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

// SSO에서 지원하는 scope 목록 (openid는 필수라 토글 불가)
const SCOPE_OPTIONS = [
  { value: 'openid', label: 'openid', required: true },
  { value: 'profile', label: 'profile', required: false },
  { value: 'email', label: 'email', required: false },
  { value: 'phone', label: 'phone', required: false },
  { value: 'address', label: 'address', required: false },
];

interface SsoClient {
  id: string;
  clientId: string;
  clientSecret: string;
  clientName: string;
  redirectUris: string[];
  logoUrl?: string | null;
  primaryColor: string;
  allowedScopes: string[];
  autoGrant: boolean;
  createdAt: string;
}

interface ClientForm {
  clientName: string;
  redirectUris: string; // 한 줄에 하나씩
  allowedScopes: string[];
  autoGrant: boolean;
  logoUrl: string;
  primaryColor: string;
}

const EMPTY_FORM: ClientForm = {
  clientName: '',
  redirectUris: '',
  allowedScopes: ['openid', 'profile'],
  autoGrant: false,
  logoUrl: '',
  primaryColor: '',
};

export function SsoClientsSection() {
  const [clients, setClients] = useState<SsoClient[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = 새로 만들기
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    const res = await apiFetch(`${API_BASE}/auth/clients`);
    if (res.ok) setClients(await res.json());
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const copyValue = (fieldKey: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (client: SsoClient) => {
    setEditingId(client.id);
    setForm({
      clientName: client.clientName,
      redirectUris: (client.redirectUris ?? []).filter(Boolean).join('\n'),
      allowedScopes: client.allowedScopes?.length
        ? client.allowedScopes
        : ['openid', 'profile'],
      autoGrant: client.autoGrant,
      logoUrl: client.logoUrl ?? '',
      primaryColor: client.primaryColor ?? '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const toggleScope = (scope: string) => {
    if (scope === 'openid') return;
    setForm((f) => ({
      ...f,
      allowedScopes: f.allowedScopes.includes(scope)
        ? f.allowedScopes.filter((s) => s !== scope)
        : [...f.allowedScopes, scope],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const redirectUris = form.redirectUris
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!form.clientName.trim()) {
      setFormError('서비스 이름을 입력하세요.');
      return;
    }
    if (redirectUris.length === 0) {
      setFormError('리다이렉트 URI를 1개 이상 입력하세요.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const body = {
        clientName: form.clientName.trim(),
        redirectUris,
        allowedScopes: form.allowedScopes,
        autoGrant: form.autoGrant,
        logoUrl: form.logoUrl.trim() || null,
        ...(form.primaryColor.trim()
          ? { primaryColor: form.primaryColor.trim() }
          : {}),
      };
      const res = await apiFetch(
        editingId
          ? `${API_BASE}/auth/clients/${editingId}`
          : `${API_BASE}/auth/clients`,
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '저장에 실패했습니다.');
      }
      setFormOpen(false);
      await fetchClients();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`${API_BASE}/auth/clients/${id}`, { method: 'DELETE' });
    await fetchClients();
  };

  const handleRegenerateSecret = async (id: string) => {
    await apiFetch(`${API_BASE}/auth/clients/${id}/regenerate-secret`, {
      method: 'POST',
    });
    await fetchClients();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SSO 클라이언트</CardTitle>
        <CardDescription>
          다른 서비스가 파란대나무숲 계정으로 로그인(SSO)하도록 연동하는 OAuth
          클라이언트를 관리합니다. (관리자 전용)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {clients.length === 0 && (
          <p className="text-sm text-muted-foreground">
            등록된 SSO 클라이언트가 없습니다.
          </p>
        )}

        {clients.map((client, index) => (
          <div key={client.id}>
            {index > 0 && <Separator className="mb-4" />}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{client.clientName}</span>
                    {client.autoGrant && (
                      <Badge variant="secondary">동의 생략</Badge>
                    )}
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 group"
                    onClick={() => copyValue(`id-${client.id}`, client.clientId)}
                    title="클릭하여 client_id 복사"
                  >
                    <code className="text-xs text-muted-foreground font-mono">
                      client_id: {client.clientId}
                    </code>
                    <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {copiedField === `id-${client.id}` ? '복사됨' : '복사'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 group"
                    onClick={() =>
                      copyValue(`secret-${client.id}`, client.clientSecret)
                    }
                    title="클릭하여 client_secret 복사"
                  >
                    <code className="text-xs text-muted-foreground font-mono">
                      client_secret: {client.clientSecret.slice(0, 6)}
                      {'•'.repeat(16)}
                    </code>
                    <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {copiedField === `secret-${client.id}` ? '복사됨' : '복사'}
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(client)}
                  >
                    수정
                  </Button>
                  <Dialog>
                    <DialogTrigger
                      render={<Button variant="outline" size="sm" />}
                    >
                      시크릿 재발급
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>클라이언트 시크릿 재발급</DialogTitle>
                        <DialogDescription>
                          "{client.clientName}"의 client_secret을 새로
                          발급합니다. 기존 시크릿은 즉시 무효화되어 해당
                          서비스의 로그인 연동이 끊어집니다.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          variant="destructive"
                          onClick={() => handleRegenerateSecret(client.id)}
                        >
                          재발급
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Dialog>
                    <DialogTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                        />
                      }
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>SSO 클라이언트 삭제</DialogTitle>
                        <DialogDescription>
                          "{client.clientName}" 클라이언트를 삭제합니다. 해당
                          서비스의 SSO 로그인이 즉시 중단되며, 이 작업은 되돌릴
                          수 없습니다.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          variant="destructive"
                          onClick={() => handleDelete(client.id)}
                        >
                          삭제
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  리다이렉트 URI
                </p>
                <div className="space-y-0.5">
                  {(client.redirectUris ?? []).filter(Boolean).map((uri) => (
                    <code
                      key={uri}
                      className="block text-xs font-mono text-muted-foreground break-all"
                    >
                      {uri}
                    </code>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">허용 scope</p>
                <div className="flex flex-wrap gap-2">
                  {(client.allowedScopes ?? []).filter(Boolean).map((scope) => (
                    <Badge key={scope} variant="default">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="pt-2">
          <Button onClick={openCreate}>클라이언트 등록</Button>
        </div>

        {/* 등록/수정 다이얼로그 */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingId ? 'SSO 클라이언트 수정' : 'SSO 클라이언트 등록'}
              </DialogTitle>
              <DialogDescription>
                {editingId
                  ? '클라이언트 설정을 변경합니다.'
                  : 'client_id와 client_secret은 등록 시 자동 발급됩니다.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>서비스 이름</Label>
                <Input
                  value={form.clientName}
                  onChange={(e) =>
                    setForm({ ...form, clientName: e.target.value })
                  }
                  placeholder="내 서비스"
                />
              </div>
              <div className="space-y-2">
                <Label>리다이렉트 URI (한 줄에 하나씩)</Label>
                <textarea
                  className="w-full min-h-20 rounded-md border bg-background px-3 py-2 text-sm font-mono"
                  value={form.redirectUris}
                  onChange={(e) =>
                    setForm({ ...form, redirectUris: e.target.value })
                  }
                  placeholder={'https://myservice.example.com/auth/callback'}
                />
              </div>
              <div className="space-y-2">
                <Label>허용 scope</Label>
                <div className="flex flex-wrap gap-2">
                  {SCOPE_OPTIONS.map((opt) => {
                    const active = form.allowedScopes.includes(opt.value);
                    return (
                      <Badge
                        key={opt.value}
                        variant={active ? 'default' : 'outline'}
                        className={
                          opt.required ? 'opacity-70' : 'cursor-pointer'
                        }
                        onClick={() => toggleScope(opt.value)}
                      >
                        {opt.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>동의 화면 생략 (내부 서비스)</Label>
                  <p className="text-xs text-muted-foreground">
                    켜면 사용자 동의 없이 바로 로그인됩니다.
                  </p>
                </div>
                <Switch
                  checked={form.autoGrant}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, autoGrant: checked })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>로고 URL (선택)</Label>
                  <Input
                    value={form.logoUrl}
                    onChange={(e) =>
                      setForm({ ...form, logoUrl: e.target.value })
                    }
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>브랜드 색상 (선택)</Label>
                  <Input
                    value={form.primaryColor}
                    onChange={(e) =>
                      setForm({ ...form, primaryColor: e.target.value })
                    }
                    placeholder="#000000"
                  />
                </div>
              </div>
              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? '저장 중...' : editingId ? '저장' : '등록'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
