'use client';

import { useState, useEffect } from 'react';
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

const API_BASE = process.env.API_NEXT_PUBLIC_API_URL || 'https://api.bbforest.net';

interface Channel {
  id: number;
  senderKey: string;
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
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const loadChannels = async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/alimtalk/channels`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        credentials: 'include',
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || '채널 목록 조회에 실패했습니다.');
      }
      const json = await res.json();
      setChannels(json.data ?? json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
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
            <Button size="sm" onClick={() => setShowWizard(true)}>
              채널 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {!apiKey && (
            <p className="text-sm text-muted-foreground text-center py-4">
              채널 목록을 보려면 알림톡 권한이 있는 API 키가 필요합니다.
            </p>
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
                    <p className="text-xs text-muted-foreground font-mono">{channel.senderKey}</p>
                    <p className="text-xs text-muted-foreground">
                      카테고리: {channel.categoryCode || '-'} · 등록:{' '}
                      {new Date(channel.createdAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <Badge variant={channel.isActive ? 'default' : 'secondary'} className="shrink-0">
                    {channel.isActive ? '활성' : '비활성'}
                  </Badge>
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
