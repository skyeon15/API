'use client';
import { apiFetch } from '@/lib/api';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import ChannelWizard from './channel-wizard';
import { CONFIG } from '@/lib/constants';
import { RefreshCw } from 'lucide-react';

const API_BASE = CONFIG.API_BASE;

interface Channel {
  id: string;
  plusId: string;
  name: string;
  categoryCode: string;
  isActive: boolean;
  createdAt: string;
}

interface ChannelManagementProps {
  apiKey: string | null;
}

export default function ChannelManagement({ apiKey }: ChannelManagementProps) {
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('ADMIN');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggleActive = async (channel: Channel) => {
    setTogglingId(channel.id);
    try {
      const res = await apiFetch(`${API_BASE}/alimtalk/channels/${channel.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ isActive: !channel.isActive }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || '변경에 실패했습니다.');
      }
      setChannels((prev) =>
        prev.map((c) => (c.id === channel.id ? { ...c, isActive: !c.isActive } : c)),
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const loadChannels = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/alimtalk/channels`, {
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || '채널 목록 조회에 실패했습니다.');
      }
      setChannels(json.data ?? json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncFromVendor = async () => {
    if (!isAdmin) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/alimtalk/channels/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || '채널 동기화에 실패했습니다.');
      }
      alert(json.message || `${json.total}개의 채널 중 ${json.added}개를 새로 추가했습니다.`);
      loadChannels();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadChannels();
    fetch(`${API_BASE}/alimtalk/categories`, { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        const data = json.data ?? json;
        const map: Record<string, string> = {};
        for (const cat of [...(data.thirdBusinessType ?? [])]) {
          map[cat.code] = cat.name;
        }
        setCategoryMap(map);
      })
      .catch(() => {});
  }, [apiKey]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>카카오 채널</CardTitle>
              <CardDescription>알림톡 발신을 위한 카카오 채널을 관리합니다.</CardDescription>
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSyncFromVendor}
                  disabled={syncing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  벤더사 동기화
                </Button>
              )}
              <Button size="sm" onClick={() => setShowWizard(true)}>
                채널 추가
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">불러오는 중...</p>
          ) : channels.length === 0 && apiKey ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              등록된 채널이 없습니다.
            </p>
          ) : (
            channels.map((channel, index) => (
              <div key={channel.id}>
                {index > 0 && <Separator className="mb-3" />}
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{channel.name}</p>
                      <span className="text-sm text-muted-foreground">{channel.plusId}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      카테고리: {categoryMap[channel.categoryCode] ?? channel.categoryCode ?? '-'} · 등록:{' '}
                      {new Date(channel.createdAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleActive(channel)}
                    disabled={togglingId === channel.id}
                    className="shrink-0"
                  >
                    <Badge variant={channel.isActive ? 'default' : 'secondary'}>
                      {togglingId === channel.id ? '처리 중...' : channel.isActive ? '활성' : '비활성'}
                    </Badge>
                  </button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ChannelWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={() => {
          setShowWizard(false);
          loadChannels();
        }}
      />
    </>
  );
}
