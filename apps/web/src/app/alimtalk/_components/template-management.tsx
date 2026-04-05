'use client';
import { apiFetch } from '@/lib/api';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import AlimtalkPreview from './preview';
import { CONFIG } from '@/lib/constants';

const API_BASE = CONFIG.API_BASE;

type TemplateType = '기본형' | '강조표기형' | '이미지형';

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
  channel?: Channel;
  type: TemplateType;
  title: string | null;
  subtitle: string | null;
  content: string;
  buttons: Button[] | null;
  inspStatus: string;
  createdAt: string;
}

interface Button {
  name: string;
  linkType: 'WL' | 'AL' | 'DS' | 'BK' | 'MD';
  linkMo?: string;
  linkPc?: string;
  linkAnd?: string;
  linkIos?: string;
}

interface TemplateFormData {
  channelId: string | '';
  name: string;
  type: TemplateType;
  content: string;
  title: string;
  subtitle: string;
  buttons: Button[];
}

const LINK_TYPE_OPTIONS = [
  { value: 'WL', label: '웹링크 (Web Link)' },
  { value: 'AL', label: '앱링크 (App Link)' },
  { value: 'DS', label: '배송조회 (Delivery)' },
  { value: 'BK', label: '봇키워드 (Bot Keyword)' },
  { value: 'MD', label: '메시지전달 (Message Delivery)' },
] as const;

const TYPE_OPTIONS: { value: TemplateType; label: string; desc: string }[] = [
  { value: '기본형', label: '기본형', desc: '일반 메시지' },
  { value: '강조표기형', label: '강조표기형', desc: '제목 강조' },
  { value: '이미지형', label: '이미지형', desc: '이미지 포함' },
];

const INSP_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  APR: { label: '승인', variant: 'default' },
  REQ: { label: '심사중', variant: 'outline' },
  REG: { label: '등록', variant: 'secondary' },
  REJ: { label: '반려', variant: 'destructive' },
};

const initialForm: TemplateFormData = {
  channelId: '',
  name: '',
  type: '기본형',
  content: '',
  title: '',
  subtitle: '',
  buttons: [],
};

interface TemplateManagementProps {
  apiKey: string | null;
}

export default function TemplateManagement({ apiKey }: TemplateManagementProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedChannelId, setSelectedChannelId] = useState<string | ''>('');
  const [showLive, setShowLive] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(initialForm);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    type: 'delete' | 'approval' | null;
    template: Template | null;
    title: string;
    message: string;
  }>({ show: false, type: null, template: null, title: '', message: '' });

  const [buttonModal, setButtonModal] = useState<{
    show: boolean;
    isEdit: boolean;
    index: number;
    data: Button;
  }>({
    show: false,
    isEdit: false,
    index: -1,
    data: { name: '', linkType: 'WL', linkMo: '', linkPc: '' },
  });

  const [resultModal, setResultModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    isError: boolean;
  }>({ show: false, title: '', message: '', isError: false });

  const callApi = async (url: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await apiFetch(`${API_BASE}${url}`, {
      ...options,
      credentials: 'include',
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || `요청 실패 (${res.status})`);
    }
    return res.json();
  };

  const loadChannels = async () => {
    try {
      const json = await callApi('/alimtalk/channels');
      setChannels(json.data ?? json);
    } catch { /* 조용히 처리 */ }
  };

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedChannelId) {
        params.set('channelId', selectedChannelId);
      }
      if (showLive) {
        const json = await callApi(`/alimtalk/templates/live?${params}`);
        const list: any[] = json.list ?? json.data ?? [];
        setTemplates(list.map((t) => ({
          id: t.code,
          code: t.code,
          name: t.name,
          channelId: selectedChannelId,
          type: t.type === 'IM' ? '이미지형' : t.type === 'EX' ? '강조표기형' : '기본형',
          title: t.title ?? null,
          subtitle: t.subtitle ?? null,
          content: t.content ?? '',
          buttons: t.buttons ?? null,
          inspStatus: t.inspStatus ?? '',
          createdAt: t.createdAt ?? '',
        })));
      } else {
        const json = await callApi(`/alimtalk/templates?${params}`);
        setTemplates(json.data ?? json);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadChannels(); loadTemplates(); }, [apiKey]);
  useEffect(() => { loadTemplates(); }, [selectedChannelId, showLive]);

  const handleSync = async () => {
    if (!selectedChannelId) return;
    setLoading(true);
    try {
      await callApi('/alimtalk/templates/sync', {
        method: 'POST',
        body: JSON.stringify({ channelId: selectedChannelId }),
      });
      setResultModal({ show: true, title: '동기화 완료', message: '최신 템플릿 정보가 DB에 동기화되었어요.', isError: false });
      setShowLive(false);
    } catch (err: any) {
      setResultModal({ show: true, title: '동기화 실패', message: err.message, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => { setFormData(initialForm); setValidationErrors({}); };

  const openCreateModal = () => {
    setEditingTemplate(null);
    resetForm();
    setShowModal(true);
    setError(null);
    setSuccess(null);
  };

  const parseButtons = (buttons: any): Button[] => {
    if (!buttons) return [];
    if (typeof buttons === 'string') {
      try { const p = JSON.parse(buttons); return p.button || p || []; } catch { return []; }
    }
    return Array.isArray(buttons) ? buttons : [];
  };

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      channelId: template.channelId,
      name: template.name,
      type: template.type,
      content: template.content,
      title: template.title || '',
      subtitle: template.subtitle || '',
      buttons: parseButtons(template.buttons),
    });
    setShowModal(true);
    setError(null);
    setSuccess(null);
  };

  const openDuplicateModal = (template: Template) => {
    setEditingTemplate(null);
    setFormData({
      channelId: template.channelId,
      name: template.name + ' (복사)',
      type: template.type,
      content: template.content,
      title: template.title || '',
      subtitle: template.subtitle || '',
      buttons: parseButtons(template.buttons),
    });
    setShowModal(true);
    setError(null);
    setSuccess(null);
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!formData.channelId) errors.channelId = '채널을 선택해주세요.';
    if (!formData.name.trim()) errors.name = '템플릿 이름을 입력해주세요.';
    if (!formData.content.trim()) errors.content = '템플릿 내용을 입력해주세요.';
    if (formData.type === '강조표기형') {
      if (!formData.title.trim()) errors.title = '타이틀을 입력해주세요.';
      if (!formData.subtitle.trim()) errors.subtitle = '보조문구를 입력해주세요.';
    }
    return errors;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) { setValidationErrors(errors); return; }
    setValidationErrors({});
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await callApi('/alimtalk/templates', {
        method: 'POST',
        body: JSON.stringify({
          channelId: Number(formData.channelId),
          name: formData.name,
          type: formData.type,
          content: formData.content,
          title: formData.title || undefined,
          subtitle: formData.subtitle || undefined,
          buttons: formData.buttons.length > 0 ? formData.buttons : undefined,
        }),
      });
      setSuccess(res.message || '템플릿이 생성되었습니다.');
      setTimeout(() => { setShowModal(false); resetForm(); setSuccess(null); }, 1200);
      loadTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    const errors = validate();
    if (Object.keys(errors).length > 0) { setValidationErrors(errors); return; }
    setValidationErrors({});
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await callApi(`/alimtalk/templates/${encodeURIComponent(editingTemplate.code)}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: formData.name,
          content: formData.content,
          title: formData.title || undefined,
          subtitle: formData.subtitle || undefined,
          buttons: formData.buttons.length > 0 ? formData.buttons : undefined,
        }),
      });
      setSuccess(res.message || '템플릿이 수정되었습니다.');
      setTimeout(() => { setShowModal(false); setEditingTemplate(null); resetForm(); setSuccess(null); }, 1200);
      loadTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async (deleteType?: 'db' | 'kakao') => {
    const { type, template } = confirmModal;
    if (!template) return;
    setConfirmModal((prev) => ({ ...prev, show: false }));
    setLoading(true);
    try {
      if (type === 'delete') {
        const t = deleteType || 'db';
        const res = await callApi(`/alimtalk/templates/${encodeURIComponent(template.code)}?type=${t}`, { method: 'DELETE' });
        const defaultMsg = t === 'db' ? `"${template.name}" 템플릿이 목록에서 삭제되었습니다.` : `"${template.name}" 템플릿이 카카오에서 영구 삭제되었습니다.`;
        setResultModal({ show: true, title: '삭제 완료', message: res.message || defaultMsg, isError: false });
      } else if (type === 'approval') {
        const res = await callApi(`/alimtalk/templates/${encodeURIComponent(template.code)}/request`, { method: 'POST' });
        setResultModal({ show: true, title: '검수 요청 완료', message: res.message || `"${template.name}" 검수 요청이 완료되었습니다.`, isError: false });
      }
      loadTemplates();
    } catch (err: any) {
      setResultModal({ show: true, title: type === 'delete' ? '삭제 실패' : '검수 요청 실패', message: err.message, isError: true });
    } finally {
      setLoading(false);
    }
  };

  const openAddButtonModal = () => {
    if (formData.buttons.length >= 5) {
      setResultModal({ show: true, title: '버튼 추가 불가', message: '버튼은 최대 5개까지 추가할 수 있습니다.', isError: true });
      return;
    }
    setButtonModal({ show: true, isEdit: false, index: -1, data: { name: '', linkType: 'WL', linkMo: '', linkPc: '' } });
  };

  const handleSaveButton = () => {
    const { data, index, isEdit } = buttonModal;
    if (!data.name.trim()) { alert('버튼명을 입력해주세요.'); return; }
    if (data.linkType === 'WL' && !data.linkMo?.trim()) { alert('웹링크 타입은 모바일 링크가 필수입니다.'); return; }
    const newButtons = [...formData.buttons];
    if (isEdit) newButtons[index] = data;
    else newButtons.push(data);
    setFormData((prev) => ({ ...prev, buttons: newButtons }));
    setButtonModal((prev) => ({ ...prev, show: false }));
  };

  return (
    <>
      {/* 필터 카드 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px] space-y-2">
              <Label>채널 필터</Label>
              <select
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background focus:ring-2 focus:ring-ring"
              >
                <option value="">전체</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name} ({ch.plusId})</option>
                ))}
              </select>
            </div>
            {selectedChannelId && (
              <>
                <Button
                  variant={showLive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowLive((v) => !v)}
                >
                  {showLive ? '실시간 조회 중' : '실시간 조회'}
                </Button>
                {showLive && (
                  <Button variant="outline" size="sm" onClick={handleSync} disabled={loading}>
                    DB 동기화
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 템플릿 목록 카드 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>템플릿</CardTitle>
              <CardDescription>알림톡 메시지 템플릿을 관리합니다.</CardDescription>
            </div>
            <Button size="sm" onClick={openCreateModal}>템플릿 생성</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}

          {loading && !showModal && !viewingTemplate ? (
            <p className="text-sm text-muted-foreground text-center py-4">불러오는 중...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">등록된 템플릿이 없습니다.</p>
          ) : (
            templates.map((template, index) => {
              const canEdit = template.inspStatus !== 'REQ' && template.inspStatus !== 'APR';
              const status = INSP_STATUS[template.inspStatus] ?? { label: template.inspStatus, variant: 'secondary' as const };
              const channelName = template.channel?.name || channels.find((c) => c.id === template.channelId)?.name || '-';

              return (
                <div key={template.id}>
                  {index > 0 && <Separator className="mb-3" />}
                  <div
                    className="flex items-start justify-between gap-4 cursor-pointer hover:bg-muted/30 rounded-lg p-2 -mx-2 transition-colors"
                    onClick={() => setViewingTemplate(template)}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{template.name}</p>
                        <code className="text-xs text-muted-foreground font-mono">{template.code}</code>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {channelName} · {template.type} · {new Date(template.createdAt).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                          onClick={() => openEditModal(template)}
                        >
                          수정
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                          onClick={() =>
                            setConfirmModal({ show: true, type: 'approval', template, title: '검수 요청', message: `"${template.name}" 템플릿의 검수를 요청할까요?` })
                          }
                        >
                          검수요청
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                        onClick={() => openDuplicateModal(template)}
                      >
                        복제
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive h-7 px-2 text-xs"
                        onClick={() =>
                          setConfirmModal({ show: true, type: 'delete', template, title: '템플릿 삭제', message: `"${template.name}" 템플릿을 삭제할까요?` })
                        }
                      >
                        삭제
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ── 생성/수정 모달 ─────────────────────────────────────────── */}
      <Dialog open={showModal} onOpenChange={(open) => { if (!open) { setShowModal(false); setEditingTemplate(null); resetForm(); setError(null); } }}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? '템플릿 수정' : '템플릿 생성'}</DialogTitle>
          </DialogHeader>

          {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">{success}</p>}
          {error && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">{error}</p>}

          <form onSubmit={editingTemplate ? handleUpdate : handleCreate}>
            <div className="flex flex-col-reverse sm:flex-row gap-6">
              <div className="flex-1 space-y-4">
                {/* 채널 */}
                <div className="space-y-2">
                  <Label>카카오 채널 <span className="text-destructive">*</span></Label>
                  <select
                    value={formData.channelId}
                    onChange={(e) => { setFormData((prev) => ({ ...prev, channelId: e.target.value })); setValidationErrors((prev) => ({ ...prev, channelId: '' })); }}
                    disabled={!!editingTemplate}
                    className={`w-full h-9 px-3 border rounded-md text-sm bg-background focus:ring-2 focus:ring-ring disabled:opacity-50 ${validationErrors.channelId ? 'border-destructive' : 'border-input'}`}
                  >
                    <option value="">채널을 선택하세요</option>
                    {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name} ({ch.plusId})</option>)}
                  </select>
                  {validationErrors.channelId && <p className="text-xs text-destructive">{validationErrors.channelId}</p>}
                  {channels.length === 0 && <p className="text-xs text-muted-foreground">채널 관리 탭에서 먼저 채널을 추가해주세요.</p>}
                </div>

                {/* 강조유형 (생성 시만) */}
                {!editingTemplate && (
                  <div className="space-y-2">
                    <Label>강조유형</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {TYPE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, type: opt.value }))}
                          className={`p-3 border-2 rounded-lg text-center transition-all ${formData.type === opt.value ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-foreground hover:border-border/80'}`}
                        >
                          <div className="font-medium text-sm">{opt.label}</div>
                          <div className="text-xs mt-0.5 opacity-60">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 이름 */}
                <div className="space-y-2">
                  <Label>템플릿 이름 <span className="text-destructive">*</span></Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => { setFormData((prev) => ({ ...prev, name: e.target.value })); setValidationErrors((prev) => ({ ...prev, name: '' })); }}
                    placeholder="예: 예약 확인 안내"
                    className={validationErrors.name ? 'border-destructive' : ''}
                  />
                  {validationErrors.name && <p className="text-xs text-destructive">{validationErrors.name}</p>}
                  <p className="text-xs text-muted-foreground">관리용 이름으로 고객에게는 표시되지 않아요.</p>
                </div>

                {/* 강조표기형 전용 */}
                {formData.type === '강조표기형' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>강조 타이틀 <span className="text-destructive">*</span></Label>
                      <Input value={formData.title} onChange={(e) => { setFormData((prev) => ({ ...prev, title: e.target.value })); setValidationErrors((prev) => ({ ...prev, title: '' })); }} placeholder="예: 예약 완료" className={validationErrors.title ? 'border-destructive' : ''} />
                      {validationErrors.title && <p className="text-xs text-destructive">{validationErrors.title}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>보조문구 <span className="text-destructive">*</span></Label>
                      <Input value={formData.subtitle} onChange={(e) => { setFormData((prev) => ({ ...prev, subtitle: e.target.value })); setValidationErrors((prev) => ({ ...prev, subtitle: '' })); }} placeholder="예: 파란대나무숲" className={validationErrors.subtitle ? 'border-destructive' : ''} />
                      {validationErrors.subtitle && <p className="text-xs text-destructive">{validationErrors.subtitle}</p>}
                    </div>
                  </div>
                )}

                {/* 내용 */}
                <div className="space-y-2">
                  <Label>템플릿 내용 <span className="text-destructive">*</span></Label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => { setFormData((prev) => ({ ...prev, content: e.target.value })); setValidationErrors((prev) => ({ ...prev, content: '' })); }}
                    className={`w-full px-3 py-2 border rounded-md font-mono text-sm resize-y bg-background focus:outline-none focus:ring-2 focus:ring-ring ${validationErrors.content ? 'border-destructive' : 'border-input'}`}
                    rows={8}
                    placeholder="#{이름}님, 예약이 완료되었습니다."
                  />
                  {validationErrors.content && <p className="text-xs text-destructive">{validationErrors.content}</p>}
                  <p className="text-xs text-muted-foreground">변수는 #{'{변수명}'} 형식으로 입력하세요.</p>
                </div>

                {/* 버튼 */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>하단 버튼</Label>
                    <Button type="button" variant="outline" size="sm" onClick={openAddButtonModal} className="h-7 text-xs">
                      + 버튼 추가
                    </Button>
                  </div>
                  {formData.buttons.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-md">추가된 버튼이 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {formData.buttons.map((btn, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{btn.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {LINK_TYPE_OPTIONS.find((o) => o.value === btn.linkType)?.label || btn.linkType}
                              {btn.linkMo && ` · ${btn.linkMo}`}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setButtonModal({ show: true, isEdit: true, index: idx, data: { ...btn } })}>수정</Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => { const b = [...formData.buttons]; b.splice(idx, 1); setFormData((prev) => ({ ...prev, buttons: b })); }}>삭제</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 미리보기 */}
              <div className="w-full sm:w-64 flex-shrink-0">
                <Label className="mb-2 block">미리보기</Label>
                <AlimtalkPreview
                  headerTitle={formData.name}
                  subtitle={formData.subtitle}
                  title={formData.title}
                  content={formData.content}
                  buttons={formData.buttons}
                  emtype={formData.type}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => { setShowModal(false); setEditingTemplate(null); resetForm(); setError(null); }} disabled={loading}>취소</Button>
              <Button type="submit" disabled={loading}>{loading ? '처리 중...' : editingTemplate ? '수정' : '생성'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── 미리보기 모달 ────────────────────────────────────────────── */}
      <Dialog open={!!viewingTemplate} onOpenChange={(open) => !open && setViewingTemplate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>템플릿 미리보기</DialogTitle>
          </DialogHeader>
          {viewingTemplate && (
            <>
              <AlimtalkPreview
                headerTitle={viewingTemplate.name}
                subtitle={viewingTemplate.subtitle || ''}
                title={viewingTemplate.title || ''}
                content={viewingTemplate.content}
                buttons={parseButtons(viewingTemplate.buttons)}
                emtype={viewingTemplate.type}
              />
              <div className="flex gap-2 flex-wrap pt-2 border-t">
                {viewingTemplate.inspStatus !== 'REQ' && viewingTemplate.inspStatus !== 'APR' && (
                  <>
                    <Button size="sm" onClick={() => { openEditModal(viewingTemplate); setViewingTemplate(null); }}>수정</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setConfirmModal({ show: true, type: 'approval', template: viewingTemplate, title: '검수 요청', message: `"${viewingTemplate.name}" 템플릿의 검수를 요청할까요?` }); setViewingTemplate(null); }}>검수요청</Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => { openDuplicateModal(viewingTemplate); setViewingTemplate(null); }}>복제</Button>
                <Button size="sm" variant="destructive" onClick={() => { setConfirmModal({ show: true, type: 'delete', template: viewingTemplate, title: '템플릿 삭제', message: `"${viewingTemplate.name}" 템플릿을 삭제할까요?` }); setViewingTemplate(null); }}>삭제</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 확인 모달 ─────────────────────────────────────────────────── */}
      <Dialog open={confirmModal.show} onOpenChange={(open) => !open && setConfirmModal((prev) => ({ ...prev, show: false }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmModal.title}</DialogTitle>
            <DialogDescription>{confirmModal.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setConfirmModal((prev) => ({ ...prev, show: false }))}>취소</Button>
            {confirmModal.type === 'delete' ? (
              <>
                <Button variant="secondary" onClick={() => handleConfirmAction('db')}>목록에서 삭제</Button>
                <Button variant="destructive" onClick={() => handleConfirmAction('kakao')}>카카오에서 영구 삭제</Button>
              </>
            ) : (
              <Button onClick={() => handleConfirmAction()}>검수 요청</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 결과 모달 ─────────────────────────────────────────────────── */}
      <Dialog open={resultModal.show} onOpenChange={(open) => !open && setResultModal((prev) => ({ ...prev, show: false }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{resultModal.title}</DialogTitle>
            <DialogDescription className={resultModal.isError ? 'text-destructive' : ''}>{resultModal.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setResultModal((prev) => ({ ...prev, show: false }))}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 버튼 편집 모달 ────────────────────────────────────────────── */}
      <Dialog open={buttonModal.show} onOpenChange={(open) => !open && setButtonModal((prev) => ({ ...prev, show: false }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{buttonModal.isEdit ? '버튼 수정' : '버튼 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>버튼명</Label>
              <Input value={buttonModal.data.name} onChange={(e) => setButtonModal((prev) => ({ ...prev, data: { ...prev.data, name: e.target.value } }))} placeholder="예: 자세히 보기" />
            </div>
            <div className="space-y-2">
              <Label>링크 유형</Label>
              <select value={buttonModal.data.linkType} onChange={(e) => setButtonModal((prev) => ({ ...prev, data: { ...prev.data, linkType: e.target.value as any } }))} className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background">
                {LINK_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            {buttonModal.data.linkType === 'WL' && (
              <>
                <div className="space-y-2">
                  <Label>모바일 링크 <span className="text-destructive">*</span></Label>
                  <Input value={buttonModal.data.linkMo || ''} onChange={(e) => setButtonModal((prev) => ({ ...prev, data: { ...prev.data, linkMo: e.target.value } }))} placeholder="https://example.com" />
                </div>
                <div className="space-y-2">
                  <Label>PC 링크</Label>
                  <Input value={buttonModal.data.linkPc || ''} onChange={(e) => setButtonModal((prev) => ({ ...prev, data: { ...prev.data, linkPc: e.target.value } }))} placeholder="미입력 시 모바일 링크 사용" />
                </div>
              </>
            )}
            {buttonModal.data.linkType === 'AL' && (
              <>
                <div className="space-y-2">
                  <Label>Android 링크</Label>
                  <Input value={buttonModal.data.linkAnd || ''} onChange={(e) => setButtonModal((prev) => ({ ...prev, data: { ...prev.data, linkAnd: e.target.value } }))} placeholder="앱 딥링크" />
                </div>
                <div className="space-y-2">
                  <Label>iOS 링크</Label>
                  <Input value={buttonModal.data.linkIos || ''} onChange={(e) => setButtonModal((prev) => ({ ...prev, data: { ...prev.data, linkIos: e.target.value } }))} placeholder="앱 딥링크" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setButtonModal((prev) => ({ ...prev, show: false }))}>취소</Button>
            <Button onClick={handleSaveButton}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
