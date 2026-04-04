'use client';
import { apiFetch } from '@/lib/api';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://gaon.bbforest.net';

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

interface Seller {
  id: number;
  sellerId: string;
  linkKey: string;
  linkVal: string;
  memo: string;
}

interface Service {
  value: string;
  label: string;
}

export default function ManagePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [serviceRegistry, setServiceRegistry] = useState<Service[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [editingKeyId, setEditingKeyId] = useState<number | null>(null);
  const [editingKeyName, setEditingKeyName] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editingPaymentName, setEditingPaymentName] = useState('');
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);

  // 결제 수단 추가 관련 상태
  const [newCard, setNewCard] = useState({
    cardNo: '',
    expMonth: '',
    expYear: '',
    cardPw: '',
    buyerAuthNo: '',
  });
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState('');

  // 판매자 계정 추가 관련 상태
  const [newSeller, setNewSeller] = useState({
    sellerId: '',
    sellerPwd: '',
    sellerPwdConfirm: '',
    sellerName: '',
    email: '',
    phone: '',
    usertype: '1',
    bizkind: '기타',
    memo: '',
    compregno: '',
    compname: '',
    biztype1: '',
    biztype2: '',
    ceo_nm: '',
  });

  const formatPhone = (val: string) => {
    const s = val.replace(/\D/g, '');
    if (s.length <= 3) return s;
    if (s.length <= 7) return `${s.slice(0, 3)}-${s.slice(3)}`;
    return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7, 11)}`;
  };

  const formatBRN = (val: string) => {
    const s = val.replace(/\D/g, '');
    if (s.length <= 3) return s;
    if (s.length <= 5) return `${s.slice(0, 3)}-${s.slice(3)}`;
    return `${s.slice(0, 3)}-${s.slice(3, 5)}-${s.slice(5, 10)}`;
  };

  const formatCardNo = (val: string) => {
    const s = val.replace(/\D/g, '');
    if (!s) return '';
    const parts = s.match(/.{1,4}/g);
    return parts ? parts.join(' ') : s;
  };

  // Input refs for auto-focus
  const cardNoRef = useRef<HTMLInputElement>(null);
  const expMonthRef = useRef<HTMLInputElement>(null);
  const expYearRef = useRef<HTMLInputElement>(null);
  const cardPwRef = useRef<HTMLInputElement>(null);
  const buyerAuthNoRef = useRef<HTMLInputElement>(null);

  const [isAddingSeller, setIsAddingSeller] = useState(false);
  const [isCheckingId, setIsCheckingId] = useState(false);
  const [idChecked, setIdChecked] = useState(false);
  const [addSellerOpen, setAddSellerOpen] = useState(false);
  const [sellerError, setSellerError] = useState('');
  const [sellerSuccess, setSellerSuccess] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/manage');
      return;
    }
    fetchData();
  }, [user, authLoading]);

  useEffect(() => {
    fetch(`${API_BASE}/services`)
      .then((res) => res.json())
      .then(setServiceRegistry)
      .catch(console.error);
  }, []);

  const fetchData = async () => {
    try {
      const [keysRes, payRes, sellRes] = await Promise.all([
        fetch(`${API_BASE}/profile/api-keys`, { credentials: 'include' }),
        fetch(`${API_BASE}/profile/payments`, { credentials: 'include' }),
        fetch(`${API_BASE}/profile/sellers`, { credentials: 'include' }),
      ]);
      setApiKeys(await keysRes.json());
      setPayments(await payRes.json());
      setSellers(await sellRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`${API_BASE}/profile/api-keys`, {
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
      await apiFetch(`${API_BASE}/profile/api-keys/${id}`, {
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
      await apiFetch(`${API_BASE}/profile/api-keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      if (prev) setApiKeys((keys) => [...keys, prev]);
      alert('삭제 실패');
    }
  };

  const toggleService = (key: ApiKey, service: string) => {
    const services = key.allowedServices || [];
    const next = services.includes(service)
      ? services.filter((s) => s !== service)
      : [...services, service];
    handleUpdateApiKey(key.id, { allowedServices: next });
  };

  const handleDeletePayment = async (id: number) => {
    const prev = payments.find((p) => p.id === id);
    setPayments((pays) => pays.filter((p) => p.id !== id));
    try {
      await apiFetch(`${API_BASE}/profile/payments/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      if (prev) setPayments((pays) => [...pays, prev]);
      alert('삭제 실패');
    }
  };

  const handleUpdatePayment = async (id: number, cardName: string) => {
    const prev = payments.find((p) => p.id === id);
    setPayments((pays) => pays.map((p) => (p.id === id ? { ...p, cardName } : p)));
    try {
      await apiFetch(`${API_BASE}/profile/payments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardName }),
        credentials: 'include',
      });
    } catch {
      if (prev) setPayments((pays) => pays.map((p) => (p.id === id ? prev : p)));
      alert('수정 실패');
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError('');
    setPaymentSuccess('');
    const cleanCardNo = newCard.cardNo.replace(/\D/g, '');
    if (cleanCardNo.length < 15) {
      setPaymentError('카드 번호가 올바르지 않습니다.');
      return;
    }
    setIsAddingPayment(true);
    try {
      const res = await apiFetch(`${API_BASE}/profile/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardNo: cleanCardNo,
          expMonth: newCard.expMonth,
          expYear: newCard.expYear,
          cardPw: newCard.cardPw,
          buyerAuthNo: newCard.buyerAuthNo,
        }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '등록 실패');
      setPaymentSuccess('카드가 성공적으로 등록되었습니다.');
      setNewCard({ cardNo: '', expMonth: '', expYear: '', cardPw: '', buyerAuthNo: '' });
      setTimeout(() => {
        setAddPaymentOpen(false);
        setPaymentSuccess('');
        fetchData();
      }, 1500);
    } catch (err: any) {
      setPaymentError(err.message);
    } finally {
      setIsAddingPayment(false);
    }
  };

  const handleCheckSellerId = async () => {
    if (!newSeller.sellerId) return;
    setIsCheckingId(true);
    try {
      const res = await apiFetch(`${API_BASE}/profile/sellers/check-id?sellerId=${newSeller.sellerId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.exists) {
        setSellerError('이미 사용 중인 아이디입니다.');
        setIdChecked(false);
      } else {
        setSellerError('');
        setIdChecked(true);
      }
    } catch {
      setSellerError('아이디 확인 중 오류가 발생했습니다.');
    } finally {
      setIsCheckingId(false);
    }
  };

  const handleAddSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    setSellerError('');
    setSellerSuccess('');
    const errors: string[] = [];
    if (!idChecked) errors.push('sellerId');
    if (!newSeller.sellerName) errors.push('sellerName');
    if (!newSeller.sellerPwd) errors.push('sellerPwd');
    if (newSeller.sellerPwd !== newSeller.sellerPwdConfirm) errors.push('sellerPwdConfirm');
    if (!newSeller.email) errors.push('email');
    if (!newSeller.phone) errors.push('phone');
    if (newSeller.usertype === '2') {
      if (!newSeller.compregno) errors.push('compregno');
      if (!newSeller.compname) errors.push('compname');
      if (!newSeller.biztype1) errors.push('biztype1');
      if (!newSeller.biztype2) errors.push('biztype2');
      if (!newSeller.ceo_nm) errors.push('ceo_nm');
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      setSellerError('필수 정보를 모두 입력해주세요.');
      return;
    }

    setIsAddingSeller(true);
    try {
      const res = await apiFetch(`${API_BASE}/profile/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSeller),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '가입 실패');
      setSellerSuccess('판매자 가입 및 등록이 완료되었습니다.');
      setTimeout(() => {
        setAddSellerOpen(false);
        setSellerSuccess('');
        fetchData();
      }, 1500);
    } catch (err: any) {
      setSellerError(err.message);
    } finally {
      setIsAddingSeller(false);
    }
  };

  const handleDeleteSeller = async (id: number) => {
    try {
      const res = await apiFetch(`${API_BASE}/profile/sellers/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      fetchData();
    } catch {
      alert('삭제 실패');
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-muted/40 pb-20">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-primary">파란대나무숲 API</span>
            <nav className="flex gap-4 text-sm">
              <Link href="/profile" className="text-muted-foreground hover:text-foreground">프로필</Link>
              <Link href="/manage" className="text-foreground font-medium">관리 콘솔</Link>
              <Link href="/alimtalk" className="text-muted-foreground hover:text-foreground">알림톡</Link>
            </nav>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>로그아웃</Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">관리 콘솔</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            API 키 및 결제 수단, 판매자 계정을 관리합니다.
          </p>
        </div>

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
                    <div className="min-w-0 space-y-2">
                      {editingKeyId === key.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (editingKeyName.trim()) {
                              handleUpdateApiKey(key.id, { name: editingKeyName.trim() });
                            }
                            setEditingKeyId(null);
                          }}
                        >
                          <Input
                            autoFocus
                            value={editingKeyName}
                            onChange={(e) => setEditingKeyName(e.target.value)}
                            onBlur={() => {
                              if (editingKeyName.trim()) {
                                handleUpdateApiKey(key.id, { name: editingKeyName.trim() });
                              }
                              setEditingKeyId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setEditingKeyId(null);
                            }}
                            className="h-7 text-sm font-medium"
                          />
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="font-medium text-left hover:underline decoration-dashed underline-offset-2 cursor-text"
                          onClick={() => {
                            setEditingKeyId(key.id);
                            setEditingKeyName(key.name);
                          }}
                          title="클릭하여 이름 변경"
                        >
                          {key.name}
                        </button>
                      )}
                      <button
                        type="button"
                        className="flex items-center gap-1.5 group"
                        onClick={() => {
                          navigator.clipboard.writeText(key.key);
                          setCopiedKeyId(key.id);
                          setTimeout(() => setCopiedKeyId(null), 2000);
                        }}
                        title="클릭하여 복사"
                      >
                        <code className="text-xs text-muted-foreground font-mono">
                          {key.key.slice(0, 8)}{'•'.repeat(16)}{key.key.slice(-4)}
                        </code>
                        <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {copiedKeyId === key.id ? '복사됨' : '복사'}
                        </span>
                      </button>
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

        {/* 페이앱 판매자 관리 */}
        <Card>
          <CardHeader>
            <CardTitle>페이앱 판매자 계정</CardTitle>
            <CardDescription>
              결제 대금을 수령할 페이앱 판매자 계정을 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sellers.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.sellerId}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    KEY: {s.linkKey.slice(0, 8)}... / VAL: {s.linkVal.slice(0, 4)}...
                  </p>
                  {s.memo && (
                    <p className="text-xs text-muted-foreground mt-1 border-t pt-1">
                      메모: {s.memo}
                    </p>
                  )}
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive shrink-0">
                      삭제
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>판매자 계정 삭제</DialogTitle>
                      <DialogDescription>
                        판매자 아이디 "{s.sellerId}" 계정을 삭제합니다.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="destructive"
                        onClick={() => handleDeleteSeller(s.id)}
                      >
                        삭제
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            ))}

            {sellers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                등록된 판매자 계정이 없습니다.
              </p>
            )}

            <div className="pt-2">
              <Dialog open={addSellerOpen} onOpenChange={setAddSellerOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    판매자 계정 가입/등록
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>판매자 계정 가입</DialogTitle>
                    <DialogDescription>
                      페이앱 판매자 회원으로 가입하고 연동 정보를 등록합니다.
                    </DialogDescription>
                  </DialogHeader>
                  
                  {sellerError && (
                    <Alert variant="destructive" className="my-2">
                      <AlertDescription>{sellerError}</AlertDescription>
                    </Alert>
                  )}
                  {sellerSuccess && (
                    <Alert className="my-2 border-green-500 text-green-600">
                      <AlertDescription>{sellerSuccess}</AlertDescription>
                    </Alert>
                  )}

                  <form onSubmit={handleAddSeller} className="space-y-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="sellerId">아이디</Label>
                        <div className="flex gap-2">
                          <Input
                            id="sellerId"
                            value={newSeller.sellerId}
                            onChange={(e) => {
                              setNewSeller({ ...newSeller, sellerId: e.target.value });
                              setIdChecked(false);
                              setValidationErrors(prev => prev.filter(v => v !== 'sellerId'));
                            }}
                            className={validationErrors.includes('sellerId') ? 'border-destructive' : ''}
                          />
                          <Button 
                            type="button" 
                            variant="secondary" 
                            size="sm" 
                            className="shrink-0"
                            onClick={handleCheckSellerId}
                            disabled={isCheckingId || !newSeller.sellerId}
                          >
                            {isCheckingId ? '확인 중' : idChecked ? '확인됨' : '중복확인'}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sellerName">판매자명/상호명</Label>
                        <Input
                          id="sellerName"
                          value={newSeller.sellerName}
                          onChange={(e) => {
                            setNewSeller({ ...newSeller, sellerName: e.target.value });
                            setValidationErrors(prev => prev.filter(v => v !== 'sellerName'));
                          }}
                          className={validationErrors.includes('sellerName') ? 'border-destructive' : ''}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="sellerPwd">비밀번호</Label>
                        <Input
                          id="sellerPwd"
                          type="password"
                          value={newSeller.sellerPwd}
                          onChange={(e) => {
                            setNewSeller({ ...newSeller, sellerPwd: e.target.value });
                            setValidationErrors(prev => prev.filter(v => v !== 'sellerPwd'));
                          }}
                          className={validationErrors.includes('sellerPwd') ? 'border-destructive' : ''}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sellerPwdConfirm">비밀번호 확인</Label>
                        <Input
                          id="sellerPwdConfirm"
                          type="password"
                          value={newSeller.sellerPwdConfirm}
                          onChange={(e) => {
                            setNewSeller({ ...newSeller, sellerPwdConfirm: e.target.value });
                            setValidationErrors(prev => prev.filter(v => v !== 'sellerPwdConfirm'));
                          }}
                          className={validationErrors.includes('sellerPwdConfirm') ? 'border-destructive' : ''}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">이메일</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="example@email.com"
                          value={newSeller.email}
                          onChange={(e) => {
                            setNewSeller({ ...newSeller, email: e.target.value });
                            setValidationErrors(prev => prev.filter(v => v !== 'email'));
                          }}
                          className={validationErrors.includes('email') ? 'border-destructive' : ''}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">휴대폰번호</Label>
                        <Input
                          id="phone"
                          placeholder="010-0000-0000"
                          value={newSeller.phone}
                          onChange={(e) => {
                            const formatted = formatPhone(e.target.value);
                            setNewSeller({ ...newSeller, phone: formatted });
                            setValidationErrors(prev => prev.filter(v => v !== 'phone'));
                          }}
                          className={validationErrors.includes('phone') ? 'border-destructive' : ''}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="usertype">판매자 구분</Label>
                        <select
                          id="usertype"
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                          value={newSeller.usertype}
                          onChange={(e) => setNewSeller({ ...newSeller, usertype: e.target.value as '1' | '2' })}
                        >
                          <option value="1">개인</option>
                          <option value="2">사업자</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bizkind">서비스 구분</Label>
                        <select
                          id="bizkind"
                          className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                          value={newSeller.bizkind}
                          onChange={(e) => setNewSeller({ ...newSeller, bizkind: e.target.value })}
                        >
                          <option value="쇼핑몰사업자">쇼핑몰사업자</option>
                          <option value="방문판매">방문판매</option>
                          <option value="음식점(배달)">음식점(배달)</option>
                          <option value="A/S긴급출동">A/S긴급출동</option>
                          <option value="운수업">운수업</option>
                          <option value="컨텐츠">컨텐츠</option>
                          <option value="도소매">도소매</option>
                          <option value="유통">유통</option>
                          <option value="서비스">서비스</option>
                          <option value="숙박업">숙박업</option>
                          <option value="임대업">임대업</option>
                          <option value="농수산업">농수산업</option>
                          <option value="기타">기타</option>
                        </select>
                      </div>
                    </div>

                    {newSeller.usertype === '2' && (
                      <div className="space-y-4 border-t pt-4 mt-4">
                        <p className="text-sm font-semibold">사업자 정보</p>
                        <div className="space-y-2">
                          <Label htmlFor="compregno">사업자등록번호</Label>
                          <Input
                            id="compregno"
                            value={newSeller.compregno}
                            onChange={(e) => {
                              const formatted = formatBRN(e.target.value);
                              setNewSeller({ ...newSeller, compregno: formatted });
                              setValidationErrors(prev => prev.filter(v => v !== 'compregno'));
                            }}
                            className={validationErrors.includes('compregno') ? 'border-destructive' : ''}
                            placeholder="000-00-00000"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="compname">상호명</Label>
                          <Input
                            id="compname"
                            value={newSeller.compname}
                            onChange={(e) => {
                              setNewSeller({ ...newSeller, compname: e.target.value });
                              setValidationErrors(prev => prev.filter(v => v !== 'compname'));
                            }}
                            className={validationErrors.includes('compname') ? 'border-destructive' : ''}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="biztype1">업태</Label>
                            <Input
                              id="biztype1"
                              value={newSeller.biztype1}
                              onChange={(e) => {
                                setNewSeller({ ...newSeller, biztype1: e.target.value });
                                setValidationErrors(prev => prev.filter(v => v !== 'biztype1'));
                              }}
                              className={validationErrors.includes('biztype1') ? 'border-destructive' : ''}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="biztype2">업종</Label>
                            <Input
                              id="biztype2"
                              value={newSeller.biztype2}
                              onChange={(e) => {
                                setNewSeller({ ...newSeller, biztype2: e.target.value });
                                setValidationErrors(prev => prev.filter(v => v !== 'biztype2'));
                              }}
                              className={validationErrors.includes('biztype2') ? 'border-destructive' : ''}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ceo_nm">대표자 성함</Label>
                          <Input
                            id="ceo_nm"
                            value={newSeller.ceo_nm}
                            onChange={(e) => {
                              setNewSeller({ ...newSeller, ceo_nm: e.target.value });
                              setValidationErrors(prev => prev.filter(v => v !== 'ceo_nm'));
                            }}
                            className={validationErrors.includes('ceo_nm') ? 'border-destructive' : ''}
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="memo">메모 (내부 관리용)</Label>
                      <Input
                        id="memo"
                        value={newSeller.memo}
                        onChange={(e) => setNewSeller({ ...newSeller, memo: e.target.value })}
                        placeholder="메모를 입력하세요"
                      />
                    </div>

                    <DialogFooter className="pt-4">
                      <Button type="submit" disabled={isAddingSeller}>
                        {isAddingSeller ? '가입 처리 중...' : '판매자 가입'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
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
                    {editingPaymentId === pm.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editingPaymentName.trim()) {
                            handleUpdatePayment(pm.id, editingPaymentName.trim());
                          }
                          setEditingPaymentId(null);
                        }}
                      >
                        <Input
                          autoFocus
                          value={editingPaymentName}
                          onChange={(e) => setEditingPaymentName(e.target.value)}
                          onBlur={() => {
                            if (editingPaymentName.trim()) {
                              handleUpdatePayment(pm.id, editingPaymentName.trim());
                            }
                            setEditingPaymentId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingPaymentId(null);
                          }}
                          className="h-7 text-sm font-medium"
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-medium hover:underline decoration-dashed underline-offset-2 cursor-text block"
                        onClick={() => {
                          setEditingPaymentId(pm.id);
                          setEditingPaymentName(pm.cardName);
                        }}
                        title="클릭하여 이름 변경"
                      >
                        {pm.cardName}
                      </button>
                    )}
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

            <div className="pt-2">
              <Dialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    결제 카드 추가
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>결제 카드 추가</DialogTitle>
                    <DialogDescription>
                      카드 정보를 안전하게 입력하여 등록하세요.
                    </DialogDescription>
                  </DialogHeader>

                  {paymentError && (
                    <Alert variant="destructive" className="my-2">
                      <AlertDescription>{paymentError}</AlertDescription>
                    </Alert>
                  )}
                  {paymentSuccess && (
                    <Alert className="my-2 border-green-500 text-green-600">
                      <AlertDescription>{paymentSuccess}</AlertDescription>
                    </Alert>
                  )}

                  <form onSubmit={handleAddPayment} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="cardNo">카드 번호 (15~16자리)</Label>
                      <Input
                        id="cardNo"
                        ref={cardNoRef}
                        value={newCard.cardNo}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                          const formatted = formatCardNo(val);
                          setNewCard({ ...newCard, cardNo: formatted });
                          if (val.length === 16) expMonthRef.current?.focus();
                        }}
                        placeholder="0000 0000 0000 0000"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="expMonth">유효기간 월 (MM)</Label>
                        <Input
                          id="expMonth"
                          ref={expMonthRef}
                          value={newCard.expMonth}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                            setNewCard({ ...newCard, expMonth: val });
                            if (val.length === 2) expYearRef.current?.focus();
                          }}
                          placeholder="01"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="expYear">유효기간 년 (YY)</Label>
                        <Input
                          id="expYear"
                          ref={expYearRef}
                          value={newCard.expYear}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                            setNewCard({ ...newCard, expYear: val });
                            if (val.length === 2) cardPwRef.current?.focus();
                          }}
                          placeholder="25"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="cardPw">비밀번호 앞 2자리</Label>
                        <Input
                          id="cardPw"
                          ref={cardPwRef}
                          type="password"
                          value={newCard.cardPw}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                            setNewCard({ ...newCard, cardPw: val });
                            if (val.length === 2) buyerAuthNoRef.current?.focus();
                          }}
                          placeholder="**"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="buyerAuthNo">생년월일(6자리)/사업자번호(10자리)</Label>
                        <Input
                          id="buyerAuthNo"
                          ref={buyerAuthNoRef}
                          value={newCard.buyerAuthNo}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                            setNewCard({ ...newCard, buyerAuthNo: val });
                          }}
                          placeholder="900101"
                          required
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={isAddingPayment}>
                        {isAddingPayment ? '등록 중...' : '카드 등록'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
