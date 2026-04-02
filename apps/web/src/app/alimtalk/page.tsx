'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ChannelManagement from './_components/channel-management';
import TemplateManagement from './_components/template-management';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.bbforest.net';

type Tab = 'channels' | 'templates';

const TABS: { key: Tab; label: string }[] = [
  { key: 'channels', label: '카카오 채널 관리' },
  { key: 'templates', label: '템플릿 관리' },
];

export default function AlimtalkPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('channels');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/alimtalk');
      return;
    }
    fetchApiKey();
  }, [user, authLoading]);

  const fetchApiKey = async () => {
    setKeyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/profile/api-keys`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const keys: { id: number; key: string; isActive: boolean; allowedServices: string[] }[] =
        await res.json();
      const valid = keys.find((k) => k.isActive && k.allowedServices?.includes('alimtalk'));
      setApiKey(valid?.key ?? null);
    } catch {
      setApiKey(null);
    } finally {
      setKeyLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (authLoading || keyLoading || !user) return null;

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold">파란대나무숲 API</span>
            <nav className="flex gap-4 text-sm">
              <Link
                href="/profile"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                프로필
              </Link>
              <Link href="/alimtalk" className="text-foreground font-medium">
                알림톡
              </Link>
            </nav>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">알림톡 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            카카오 알림톡 채널 및 템플릿을 관리합니다.
          </p>
        </div>

        {!apiKey && (
          <Alert>
            <AlertDescription>
              채널 목록 조회 및 템플릿 관리에는{' '}
              <strong>알림톡 권한이 활성화된 API 키</strong>가 필요합니다.{' '}
              <Link href="/profile" className="underline">
                프로필에서 설정하기
              </Link>{' '}
              (채널 추가는 API 키 없이도 가능합니다)
            </AlertDescription>
          </Alert>
        )}

        {/* 탭 */}
        <div className="flex gap-1 border-b">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {activeTab === 'channels' && <ChannelManagement apiKey={apiKey} />}
          {activeTab === 'templates' && <TemplateManagement apiKey={apiKey} />}
        </div>
      </main>
    </div>
  );
}
