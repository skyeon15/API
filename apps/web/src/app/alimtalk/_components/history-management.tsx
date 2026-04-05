'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/constants';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import AlimtalkPreview from './preview';

const API_BASE = CONFIG.API_BASE;

interface HistoryItem {
  id: string;
  transactionId: string | null;
  createdAt: string;
  channelId: string;
  channel: {
    name: string;
    plusId: string;
  };
  templateCode: string;
  receiverPhone: string;
  content: string;
  resultCode: string | null;
  resultMessage: string | null;
  sentByUserId: string | null;
  sentByUser?: {
    name: string;
    nickname: string | null;
  } | null;
  title: string | null;
  subtitle: string | null;
  buttons: any[] | null;
  type: string;
}

interface HistoryResponse {
  items: HistoryItem[];
  total: number;
  page: number;
  limit: number;
}

interface HistoryManagementProps {
  apiKey: string | null;
}

export default function HistoryManagement({ apiKey }: HistoryManagementProps) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

  const fetchHistory = async (pageNumber: number) => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await apiFetch(`${API_BASE}/alimtalk/history?page=${pageNumber}&limit=15`, {
        headers,
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('발송 내역을 불러오는데 실패했습니다.');
      }

      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(page);
  }, [apiKey, page]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  const getStatusBadge = (code: string | null, message: string | null) => {
    if (code === 'SUCCESS' || code === '0' || code === 'S') {
      return <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 border-0">성공</Badge>;
    }
    if (code === 'PENDING' || code === '3' || code === '4') {
      return <Badge variant="secondary" className="bg-blue-500 hover:bg-blue-600 text-white border-0">예약</Badge>;
    }
    if (code === 'CANCELLED') {
      return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 uppercase">취소</Badge>;
    }
    if (code === null || code === '') {
      return <Badge variant="outline" className="text-muted-foreground">처리중</Badge>;
    }
    return (
      <Badge variant="destructive" title={message || '알 수 없는 오류'}>
        실패 {code ? `(${code})` : ''}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>발송 내역</CardTitle>
        <CardDescription>
          최근 발송된 알림톡 내역을 확인합니다. (총 {data?.total ?? 0}건)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md mb-4">
            {error}
          </div>
        )}

        <div className="rounded-md border overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
            <div className="w-[110px]">발송일시</div>
            <div className="w-[140px]">TID</div>
            <div className="w-[100px]">채널</div>
            <div className="w-[100px]">템플릿</div>
            <div className="w-[120px]">수신번호</div>
            <div className="flex-1 min-w-[200px]">내용</div>
            <div className="w-[50px]">상태</div>
            <div className="w-[80px] text-right">발송자</div>
          </div>

          <div className="divide-y">
            {loading ? (
              <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
                불러오는 중...
              </div>
            ) : data?.items.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
                발송 내역이 없습니다.
              </div>
            ) : (
              data?.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center px-4 py-3 text-xs text-foreground/80 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="w-[110px]">
                    {new Date(item.createdAt).toLocaleString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </div>
                  <div className="w-[140px] truncate pr-2" title={item.transactionId || ''}>
                    {item.transactionId}
                  </div>
                  <div className="w-[100px] truncate pr-2">
                    {item.channel?.name || '삭제된 채널'}
                  </div>
                  <div className="w-[100px] pr-2">
                    {item.templateCode}
                  </div>
                  <div className="w-[120px] pr-2">{item.receiverPhone}</div>
                  <div className="flex-1 min-w-[200px] truncate pr-4" title={item.content}>
                    {item.content}
                  </div>
                  <div className="w-[50px]">
                    {getStatusBadge(item.resultCode, item.resultMessage)}
                  </div>
                  <div className="w-[80px] text-right tabular-nums truncate">
                    {item.sentByUser?.nickname || item.sentByUser?.name || item.sentByUserId?.slice(0, 8) || 'System'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end space-x-2 py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              이전
            </Button>
            <div className="text-sm font-medium">
              {page} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >
              다음
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>발송 내용 상세</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="text-xs space-y-1 bg-muted p-3 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">발송일시:</span>
                  <span>{new Date(selectedItem.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TID:</span>
                  <span className="font-mono text-[10px]">{selectedItem.transactionId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">수신번호:</span>
                  <span>{selectedItem.receiverPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">상태:</span>
                  <span>{selectedItem.resultMessage} ({selectedItem.resultCode})</span>
                </div>
              </div>
              
              <AlimtalkPreview
                headerTitle={selectedItem.channel?.name}
                title={selectedItem.title ?? undefined}
                subtitle={selectedItem.subtitle ?? undefined}
                content={selectedItem.content}
                emtype={selectedItem.title ? '강조표기형' : '기본형'}
                buttons={selectedItem.buttons || []}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
