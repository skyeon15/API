'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.bbforest.net';

interface ApiKey {
  id: number;
  name: string;
  key: string;
  isActive: boolean;
  allowedServices: string[];
}

interface Payment {
  id: number;
  cardName: string;
  cardNo: string;
}

interface Service {
  value: string;
  label: string;
}

export default function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [serviceRegistry, setServiceRegistry] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login?redirect=/profile');
      return;
    }
    setName(user.name);
    setCompany(user.company || '');
    fetchData();
  }, [user, loading]);

  useEffect(() => {
    fetch(`${API_BASE}/services`)
      .then((res) => res.json())
      .then(setServiceRegistry)
      .catch(console.error);
  }, []);

  const fetchData = async () => {
    try {
      const [keysRes, payRes] = await Promise.all([
        fetch(`${API_BASE}/profile/api-keys`, { credentials: 'include' }),
        fetch(`${API_BASE}/profile/payments`, { credentials: 'include' }),
      ]);
      setApiKeys(await keysRes.json());
      setPayments(await payRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setProfileError('');
    setProfileSuccess(false);
    try {
      await fetch(`${API_BASE}/profile/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, company }),
        credentials: 'include',
      });
      await refresh();
      setProfileSuccess(true);
    } catch {
      setProfileError('업데이트에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/profile/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
        credentials: 'include',
      });
      const newKey = await res.json();
      setApiKeys((prev) => [...prev, newKey]);
      setNewKeyName('');
    } catch {
      alert('키 생성 실패');
    }
  };

  const handleUpdateApiKey = async (id: number, data: Partial<ApiKey>) => {
    const prev = apiKeys.find((k) => k.id === id);
    setApiKeys((keys) => keys.map((k) => (k.id === id ? { ...k, ...data } : k)));
    try {
      await fetch(`${API_BASE}/profile/api-keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
    } catch {
      if (prev) setApiKeys((keys) => keys.map((k) => (k.id === id ? prev : k)));
      alert('수정 실패');
    }
  };

  const handleDeleteApiKey = async (id: number) => {
    const prev = apiKeys.find((k) => k.id === id);
    setApiKeys((keys) => keys.filter((k) => k.id !== id));
    try {
      await fetch(`${API_BASE}/profile/api-keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      if (prev) setApiKeys((keys) => [...keys, prev]);
      alert('삭제 실패');
    }
  };

  const handleDeletePayment = async (id: number) => {
    const prev = payments.find((p) => p.id === id);
    setPayments((pays) => pays.filter((p) => p.id !== id));
    try {
      await fetch(`${API_BASE}/profile/payments/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      if (prev) setPayments((pays) => [...pays, prev]);
      alert('삭제 실패');
    }
  };

  const toggleService = async (key: ApiKey, serviceValue: string) => {
    const current = key.allowedServices || [];
    const next = current.includes(serviceValue)
      ? current.filter((s) => s !== serviceValue)
      : [...current, serviceValue];

    setApiKeys((prev) =>
      prev.map((k) => (k.id === key.id ? { ...k, allowedServices: next } : k))
    );

    try {
      await fetch(`${API_BASE}/profile/api-keys/${key.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedServices: next }),
        credentials: 'include',
      });
    } catch {
      setApiKeys((prev) =>
        prev.map((k) => (k.id === key.id ? { ...k, allowedServices: current } : k))
      );
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold">파란대나무숲 API</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* 기본 정보 */}
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
            <CardDescription>이름과 소속을 수정할 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {profileError && (
                <Alert variant="destructive">
                  <AlertDescription>{profileError}</AlertDescription>
                </Alert>
              )}
              {profileSuccess && (
                <Alert>
                  <AlertDescription>프로필이 업데이트되었습니다.</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">이름</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">회사/소속</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>휴대폰 번호</Label>
                  <Input value={user.phone} readOnly disabled />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={loading}>
                  {loading ? '저장 중...' : '저장'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* API 키 관리 */}
        <Card>
          <CardHeader>
            <CardTitle>API 키</CardTitle>
            <CardDescription>
              서비스별 접근 권한을 가진 API 키를 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {apiKeys.map((key, index) => (
              <div key={key.id}>
                {index > 0 && <Separator className="mb-4" />}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium">{key.name}</p>
                      <code className="text-xs text-muted-foreground break-all">
                        {key.key}
                      </code>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={key.isActive}
                          onCheckedChange={(checked) =>
                            handleUpdateApiKey(key.id, { isActive: checked })
                          }
                        />
                        <span className="text-sm text-muted-foreground">
                          {key.isActive ? '활성' : '비활성'}
                        </span>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>API 키 삭제</DialogTitle>
                            <DialogDescription>
                              "{key.name}" 키를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button
                              variant="destructive"
                              onClick={() => handleDeleteApiKey(key.id)}
                            >
                              삭제
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-2">허용된 서비스</p>
                    <div className="flex flex-wrap gap-2">
                      {serviceRegistry.map((service) => {
                        const active = key.allowedServices?.includes(service.value);
                        return (
                          <Badge
                            key={service.value}
                            variant={active ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => toggleService(key, service.value)}
                          >
                            {service.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {apiKeys.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                발급된 API 키가 없습니다.
              </p>
            )}

            <Separator />

            <form onSubmit={handleCreateApiKey} className="flex gap-2">
              <Input
                placeholder="새 API 키 이름 (예: 모바일 앱)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                required
              />
              <Button type="submit" variant="secondary">
                발급
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 결제 수단 */}
        <Card>
          <CardHeader>
            <CardTitle>결제 수단</CardTitle>
            <CardDescription>등록된 결제 카드를 관리합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {payments.map((pm) => (
              <div
                key={pm.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-7 bg-muted rounded flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                    CARD
                  </div>
                  <div>
                    <p className="text-sm font-medium">{pm.cardName}</p>
                    <p className="text-xs text-muted-foreground">{pm.cardNo}</p>
                  </div>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                      삭제
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>결제 수단 삭제</DialogTitle>
                      <DialogDescription>
                        {pm.cardName} ({pm.cardNo}) 카드를 삭제합니다.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="destructive"
                        onClick={() => handleDeletePayment(pm.id)}
                      >
                        삭제
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            ))}

            {payments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                등록된 결제 수단이 없습니다.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
