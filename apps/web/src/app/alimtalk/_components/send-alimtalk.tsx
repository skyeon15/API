'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { CONFIG } from '@/lib/constants';
import AlimtalkPreview from './preview';

const API_BASE = CONFIG.API_BASE;

interface AlimtalkButton {
  name: string;
  linkType?: string;
  linkMo?: string;
  linkPc?: string;
  linkM?: string;
  linkP?: string;
  linkAnd?: string;
  linkIos?: string;
  [key: string]: any;
}

interface Channel {
  id: string;
  name: string;
  plusId: string;
  isActive: boolean;
}

interface Template {
  id: string;
  code: string;
  name: string;
  channelId: string;
  content: string;
  title: string | null;
  subtitle: string | null;
  buttons: AlimtalkButton[] | null;
  type: string;
  inspStatus: string;
}

interface SendAlimtalkProps {
  apiKey: string | null;
}

function extractVariables(items: (string | null | undefined)[]): string[] {
  const combined = items.filter(Boolean).join(' ');
  const matches = combined.match(/#\{([^}]+)\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -1)))];
}

export default function SendAlimtalk({ apiKey }: SendAlimtalkProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [receiverPhone, setReceiverPhone] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const callApi = async (url: string, options: RequestInit = {}) => {
    const { apiFetch } = await import('@/lib/api');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await apiFetch(`${API_BASE}${url}`, {
      ...options,
      credentials: 'include',
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || `요청 실패 (${res.status})`);
    return json;
  };

  useEffect(() => {
    callApi('/alimtalk/channels')
      .then((json) => setChannels(json.data ?? json))
      .catch(() => {});
  }, [apiKey]);

  useEffect(() => {
    if (!selectedChannelId) {
      setTemplates([]);
      setSelectedTemplate(null);
      return;
    }
    callApi(`/alimtalk/templates?channelId=${selectedChannelId}`)
      .then((json) =>
        setTemplates((json.data ?? json).filter((t: Template) => t.inspStatus === 'APR')),
      )
      .catch(() => {});
    setSelectedTemplate(null);
  }, [selectedChannelId]);

  // 사용 중인 변수 목록 추출 (필드/버튼 포함)
  const varKeys = useMemo(() => {
    if (!selectedTemplate) return [];
    const buttonTexts = (selectedTemplate.buttons ?? []).flatMap((btn) => [
      btn.name,
      btn.linkMo,
      btn.linkPc,
      btn.linkM,
      btn.linkP,
    ]);
    return extractVariables([
      selectedTemplate.content,
      selectedTemplate.title,
      selectedTemplate.subtitle,
      ...buttonTexts,
    ]);
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate) {
      setVariables({});
      return;
    }
    setVariables(Object.fromEntries(varKeys.map((v) => [v, ''])));
  }, [selectedTemplate, varKeys]);

  const replaceVars = (text: string | null | undefined) => {
    if (!text) return text ?? '';
    return text.replace(/#\{([^}]+)\}/g, (_, k) => variables[k] || `#{${k}}`);
  };

  const handleSend = async () => {
    if (!selectedTemplate || !receiverPhone || !selectedChannelId) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await callApi('/alimtalk/send', {
        method: 'POST',
        body: JSON.stringify({
          channelId: selectedChannelId,
          templateCode: selectedTemplate.code,
          receiverPhone: receiverPhone.replace(/-/g, ''),
          variables,
          ...(scheduledAt ? { scheduledAt } : {}),
        }),
      });
      setResult({
        success: true,
        message:
          res.message ||
          (scheduledAt ? '예약 발송이 등록되었습니다.' : '발송이 완료되었습니다.'),
      });
      setReceiverPhone('');
      setVariables(Object.fromEntries(varKeys.map((k) => [k, ''])));
      setScheduledAt('');
    } catch (err: any) {
      setResult({ success: false, message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* 발송 설정 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>알림톡 발송</CardTitle>
          <CardDescription>승인된 템플릿으로 알림톡을 발송합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 채널 선택 */}
          <div className="space-y-1.5">
            <Label>채널</Label>
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background"
            >
              <option value="">채널 선택</option>
              {channels
                .filter((ch) => ch.isActive)
                .map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} ({ch.plusId})
                  </option>
                ))}
            </select>
          </div>

          {/* 템플릿 선택 */}
          <div className="space-y-1.5">
            <Label>템플릿</Label>
            <select
              value={selectedTemplate?.code ?? ''}
              onChange={(e) =>
                setSelectedTemplate(templates.find((t) => t.code === e.target.value) ?? null)
              }
              disabled={!selectedChannelId}
              className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background disabled:opacity-50"
            >
              <option value="">템플릿 선택 (승인된 항목만 표시)</option>
              {templates.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && (
            <>
              {/* 변수 입력 */}
              {varKeys.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>치환 변수 입력</Label>
                    <span className="text-[10px] text-muted-foreground">본문 및 버튼 포함</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-muted/30">
                    {varKeys.map((key) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground truncate block">#{`{${key}}`}</Label>
                        <Input
                          value={variables[key] ?? ''}
                          onChange={(e) =>
                            setVariables((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder={key}
                          className="h-8 text-xs focus-visible:ring-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 수신자 */}
          <div className="space-y-1.5">
            <Label>수신자 전화번호</Label>
            <Input
              value={receiverPhone}
              onChange={(e) => setReceiverPhone(e.target.value)}
              placeholder="01012345678"
            />
          </div>

          {/* 예약 발송 */}
          <div className="space-y-1.5">
            <Label>예약 발송 (선택)</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              min={(() => {
                const now = new Date();
                now.setSeconds(0, 0);
                return now.toISOString().slice(0, 16);
              })()}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          {result && (
            <p className={`text-sm ${result.success ? 'text-green-600' : 'text-destructive'}`}>
              {result.message}
            </p>
          )}

          <Button
            onClick={handleSend}
            disabled={loading || !selectedTemplate || !receiverPhone}
            className="w-full"
          >
            {loading ? '발송 중...' : scheduledAt ? '예약 발송' : '즉시 발송'}
          </Button>
        </CardContent>
      </Card>

      {/* 미리보기 카드 */}
      <div className="sticky top-6">
        <div className="flex items-center justify-between mb-2 px-1">
          <Label className="text-muted-foreground font-bold">미리보기</Label>
          {selectedTemplate && (
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">
              {selectedTemplate.type === 'EMPHASIS' ? '강조표기형' : '기본형'}
            </span>
          )}
        </div>
        {!selectedTemplate ? (
          <div className="bg-muted aspect-[3/4] rounded-xl flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed border-muted-foreground/20">
            템플릿을 선택해 주세요.
          </div>
        ) : (
          <AlimtalkPreview
            headerTitle={channels.find((c) => c.id === selectedChannelId)?.name}
            title={replaceVars(selectedTemplate.title)}
            subtitle={replaceVars(selectedTemplate.subtitle)}
            content={replaceVars(selectedTemplate.content)}
            emtype={selectedTemplate.type === 'EMPHASIS' ? '강조표기형' : '기본형'}
            buttons={(selectedTemplate.buttons ?? []).map((btn) => ({
              ...btn,
              name: replaceVars(btn.name),
              linkMo: replaceVars(btn.linkMo || btn.linkM),
              linkPc: replaceVars(btn.linkPc || btn.linkP),
            }))}
          />
        )}
      </div>
    </div>
  );
}
