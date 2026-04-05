'use client';
import { apiFetch } from '@/lib/api';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '@/components/ui/button';
import ChannelManagement from './_components/channel-management';
import TemplateManagement from './_components/template-management';
import SendAlimtalk from './_components/send-alimtalk';
import HistoryManagement from './_components/history-management';
import { CONFIG } from '@/lib/constants';
import { useState } from 'react';

const API_BASE = CONFIG.API_BASE;

type Tab = 'channels' | 'templates' | 'send' | 'history';

const TABS: { key: Tab; label: string; path: string }[] = [
  { key: 'channels', label: '채널 관리', path: '/alimtalk/channels' },
  { key: 'templates', label: '템플릿 관리', path: '/alimtalk/templates' },
  { key: 'send', label: '발송', path: '/alimtalk/send' },
  { key: 'history', label: '발송 내역', path: '/alimtalk/history' },
];

function getTabFromPath(pathname: string): Tab {
  if (pathname.startsWith('/alimtalk/templates')) return 'templates';
  if (pathname.startsWith('/alimtalk/send')) return 'send';
  if (pathname.startsWith('/alimtalk/history')) return 'history';
  return 'channels';
}

export default function AlimtalkPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(true);

  const activeTab = getTabFromPath(pathname);

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
      const res = await apiFetch(`${API_BASE}/profile/api-keys`, { credentials: 'include' });
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
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold">파란대나무숲 API</span>
            <nav className="flex gap-4 text-sm">
              <Link
                href="/profile"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                프로필
              </Link>
              <Link
                href="/manage"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                관리 콘솔
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

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">알림톡 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            카카오 알림톡 채널 및 템플릿을 관리합니다.
          </p>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 border-b">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={tab.path}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="space-y-4">
          {activeTab === 'channels' && <ChannelManagement apiKey={apiKey} />}
          {activeTab === 'templates' && <TemplateManagement apiKey={apiKey} />}
          {activeTab === 'send' && <SendAlimtalk apiKey={apiKey} />}
          {activeTab === 'history' && <HistoryManagement apiKey={apiKey} />}
        </div>
      </main>
    </div>
  );
}
