'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

interface SocialAccount {
  provider: string;
  syncedAt: string;
}

interface Grant {
  clientId: string;
  client: {
    clientName: string;
    logoUrl?: string;
  };
  grantedScopes: string[];
  createdAt: string;
}

export default function ProfilePage() {
  const { user, loading: authLoading, refresh, logout } = useAuth();
  const router = useRouter();

  // Profile fields
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    birthDate: '',
    gender: '',
    address: '',
    detailAddress: '',
    zipCode: '',
  });

  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/profile');
      return;
    }
    setProfile({
      name: user.name || '',
      email: user.email || '',
      birthDate: user.birthDate || '',
      gender: user.gender || '',
      address: user.address || '',
      detailAddress: user.detailAddress || '',
      zipCode: user.zipCode || '',
    });
    fetchIamData();
  }, [user, authLoading]);

  const fetchIamData = async () => {
    try {
      const [socialRes, grantRes] = await Promise.all([
        fetch(`${API_BASE}/auth/social`, { credentials: 'include' }),
        fetch(`${API_BASE}/auth/grants`, { credentials: 'include' }),
      ]);
      setSocialAccounts(await socialRes.json());
      setGrants(await grantRes.json());
    } catch (err) {
      console.error('Failed to fetch IAM data', err);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setProfileError('');
    setProfileSuccess(false);
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      await refresh();
      setProfileSuccess(true);
    } catch {
      setProfileError('프로필 업데이트에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkSocial = (provider: string) => {
    // API 서버의 소셜 로그인 엔드포인트로 리다이렉트
    // 로그인 완료 후 다시 /profile로 돌아오도록 redirect 쿼리 추가
    const authUrl = `${API_BASE}/auth/${provider}?redirect=${encodeURIComponent(window.location.origin + '/profile')}`;
    window.location.href = authUrl;
  };

  const handleUnlinkSocial = async (provider: string) => {
    if (!confirm(`${provider} 연동을 해제하시겠습니까?`)) return;
    try {
      const res = await fetch(`${API_BASE}/auth/social/${provider}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '해제 실패');
      }
      fetchIamData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRevokeGrant = async (clientId: string) => {
    if (!confirm('이 서비스의 연결을 해제하시겠습니까? 더 이상 로그인이 불가능할 수 있습니다.')) return;
    try {
      await fetch(`${API_BASE}/auth/grants/${clientId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      fetchIamData();
    } catch {
      alert('연결 해제 실패');
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
            <span className="font-bold text-primary">Identity Center</span>
            <nav className="flex gap-4 text-sm">
              <Link href="/profile" className="text-foreground font-medium">프로필 관리</Link>
              <Link href="/manage" className="text-muted-foreground hover:text-foreground">관리 콘솔</Link>
              <Link href="/alimtalk" className="text-muted-foreground hover:text-foreground">알림톡</Link>
            </nav>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>로그아웃</Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Col: Basic Info & Profile Edit */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>내 프로필</CardTitle>
              <CardDescription>통합 Identity 정보를 관리합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                {profileSuccess && <Alert className="border-green-500 text-green-600"><AlertDescription>정보가 성공적으로 수정되었습니다.</AlertDescription></Alert>}
                {profileError && <Alert variant="destructive"><AlertDescription>{profileError}</AlertDescription></Alert>}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">이름</Label>
                    <Input id="name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">이메일</Label>
                    <Input id="email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birth">생년월일</Label>
                    <Input id="birth" type="date" value={profile.birthDate} onChange={(e) => setProfile({ ...profile, birthDate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>성별</Label>
                    <div className="flex gap-4 h-10 items-center">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="gender" value="M" checked={profile.gender === 'M'} onChange={(e) => setProfile({ ...profile, gender: e.target.value })} /> 남성
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="gender" value="F" checked={profile.gender === 'F'} onChange={(e) => setProfile({ ...profile, gender: e.target.value })} /> 여성
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>주소</Label>
                  <div className="flex gap-2">
                    <Input placeholder="우편번호" className="w-24" value={profile.zipCode} onChange={(e) => setProfile({ ...profile, zipCode: e.target.value })} />
                    <Input placeholder="기본 주소" className="flex-1" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
                  </div>
                  <Input placeholder="상세 주소" value={profile.detailAddress} onChange={(e) => setProfile({ ...profile, detailAddress: e.target.value })} />
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={loading}>{loading ? '저장 중...' : '변경사항 저장'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Connected Services (OauthGrant) */}
          <Card>
            <CardHeader>
              <CardTitle>연결된 서비스</CardTitle>
              <CardDescription>귀하의 정보에 접근을 허용한 외부 서비스 목록입니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {grants.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">연결된 서비스가 없습니다.</p>}
              {grants.map((grant) => (
                <div key={grant.clientId} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center font-bold">
                      {grant.client.logoUrl ? <img src={grant.client.logoUrl} className="w-full h-full rounded-full" /> : grant.client.clientName[0]}
                    </div>
                    <div>
                      <p className="font-semibold">{grant.client.clientName}</p>
                      <div className="flex gap-1 mt-1">
                        {grant.grantedScopes.map(s => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleRevokeGrant(grant.clientId)}>연결 해제</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Social Accounts & Meta */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>연동된 소셜 계정</CardTitle>
              <CardDescription>로그인에 사용하는 소셜 계정들입니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {['kakao', 'naver', 'google', 'apple'].map(provider => {
                const isLinked = socialAccounts.find(s => s.provider === provider);
                return (
                  <div key={provider} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isLinked ? 'bg-primary text-white' : 'bg-muted'}`}>
                        {provider[0].toUpperCase()}
                      </div>
                      <span className="text-sm capitalize font-medium">{provider}</span>
                    </div>
                    {isLinked ? (
                      <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => handleUnlinkSocial(provider)}>해제</Button>
                    ) : (
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => handleLinkSocial(provider)}>연결</Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>계정 보안</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">가입일</span>
                <span>{new Date(user.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="text-[10px] font-mono">{user.id}</span>
              </div>
              <Separator className="my-2" />
              <Button variant="destructive" className="w-full" size="sm">회원 탈퇴</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
