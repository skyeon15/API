'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.bbforest.net';

interface Category {
  parentCode: string;
  code: string;
  name: string;
}

interface CategoryResponse {
  firstBusinessType: Category[];
  secondBusinessType: Category[];
  thirdBusinessType: Category[];
}

interface ChannelWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const formatPhone = (val: string) => {
  const s = val.replace(/\D/g, '');
  if (s.length <= 3) return s;
  if (s.length <= 7) return `${s.slice(0, 3)}-${s.slice(3)}`;
  return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7, 11)}`;
};

export default function ChannelWizard({ isOpen, onClose, onSuccess }: ChannelWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryResponse | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [authCooldown, setAuthCooldown] = useState(0);

  const [formData, setFormData] = useState({
    plusId: '@',
    phone: '',
    name: '',
    categoryCode: '',
    authNum: '',
  });

  const [selectedFirst, setSelectedFirst] = useState('');
  const [selectedSecond, setSelectedSecond] = useState('');
  const [selectedThird, setSelectedThird] = useState('');

  useEffect(() => {
    if (isOpen && !categories) loadCategories();
  }, [isOpen]);

  useEffect(() => {
    if (authCooldown > 0) {
      const timer = setTimeout(() => setAuthCooldown(authCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [authCooldown]);

  useEffect(() => {
    if (selectedThird) setFormData((prev) => ({ ...prev, categoryCode: selectedThird }));
  }, [selectedThird]);

  const loadCategories = async () => {
    setLoadingCategories(true);
    try {
      const res = await fetch(`${API_BASE}/alimtalk/categories`, { credentials: 'include' });
      const json = await res.json();
      const data = json.data ?? json;
      setCategories({
        firstBusinessType: data.firstBusinessType ?? [],
        secondBusinessType: data.secondBusinessType ?? [],
        thirdBusinessType: data.thirdBusinessType ?? [],
      });
    } catch {
      setError('카테고리 조회에 실패했어요.');
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleNextStep = async () => {
    if (step === 1) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/alimtalk/channels/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ plusId: formData.plusId, phone: formData.phone.replace(/-/g, '') }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.message || '인증 요청에 실패했어요.');
        }
        setAuthCooldown(60);
        setFormData((prev) => ({ ...prev, authNum: '' }));
        setStep(2);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      setStep(step + 1);
    }
  };

  const handleResendAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/alimtalk/channels/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plusId: formData.plusId, phone: formData.phone.replace(/-/g, '') }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || '재요청에 실패했어요.');
      }
      setAuthCooldown(60);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/alimtalk/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plusId: formData.plusId,
          authNum: formData.authNum,
          phone: formData.phone.replace(/-/g, ''),
          categoryCode: formData.categoryCode,
          name: formData.name,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || '채널 추가에 실패했어요.');
      }
      onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setFormData({ plusId: '@', phone: '', name: '', categoryCode: '', authNum: '' });
    setSelectedFirst('');
    setSelectedSecond('');
    setSelectedThird('');
    setAuthCooldown(0);
    setError(null);
    onClose();
  };

  const secondCategories = (categories?.secondBusinessType ?? []).filter((c) => c.parentCode === selectedFirst);
  const thirdCategories = (categories?.thirdBusinessType ?? []).filter((c) => c.parentCode === selectedSecond);

  const canProceedStep1 =
    formData.plusId.length > 1 && formData.phone && formData.name && formData.categoryCode;
  const canProceedStep2 = !!formData.authNum;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>채널 등록</DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="flex items-center justify-between mb-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div className={`flex-1 h-1 mx-2 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mb-4">
          <span className={step >= 1 ? 'text-blue-600 font-medium' : ''}>기본 정보</span>
          <span className={step >= 2 ? 'text-blue-600 font-medium' : ''}>인증</span>
          <span className={step >= 3 ? 'text-blue-600 font-medium' : ''}>확인</span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm whitespace-pre-line">
            {error}
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                카카오 채널 ID <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.plusId}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    plusId: val.startsWith('@') ? val : '@' + val.replace('@', ''),
                  }));
                }}
                placeholder="@채널아이디"
              />
              <p className="text-xs text-gray-500">채널 검색용 아이디를 입력하세요</p>
            </div>

            <div className="space-y-2">
              <Label>
                채널 별칭 <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="예: 파란대나무숲"
              />
              <p className="text-xs text-gray-500">관리용 채널 이름</p>
            </div>

            <div className="space-y-2">
              <Label>
                관리자 전화번호 <span className="text-red-500">*</span>
              </Label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: formatPhone(e.target.value) }))}
                placeholder="010-1234-5678"
              />
              <p className="text-xs text-gray-500">카카오톡 인증번호를 받을 번호</p>
            </div>

            <div className="space-y-2">
              <Label>
                카테고리 선택 <span className="text-red-500">*</span>
              </Label>
              {loadingCategories ? (
                <p className="text-sm text-gray-500 py-4 text-center">카테고리 로딩 중...</p>
              ) : (
                <div className="space-y-2">
                  <select
                    value={selectedFirst}
                    onChange={(e) => {
                      setSelectedFirst(e.target.value);
                      setSelectedSecond('');
                      setSelectedThird('');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">대분류 선택</option>
                    {categories?.firstBusinessType.map((cat) => (
                      <option key={cat.code} value={cat.code}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {selectedFirst && (
                    <select
                      value={selectedSecond}
                      onChange={(e) => {
                        setSelectedSecond(e.target.value);
                        setSelectedThird('');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">중분류 선택</option>
                      {secondCategories.map((cat) => (
                        <option key={cat.code} value={cat.code}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedSecond && (
                    <select
                      value={selectedThird}
                      onChange={(e) => setSelectedThird(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">소분류 선택</option>
                      {thirdCategories.map((cat) => (
                        <option key={cat.code} value={cat.code}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>다음</strong> 버튼을 누르면 입력하신 전화번호로 인증번호가 전송돼요.
              </p>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                인증번호가 카카오톡으로 전송되었어요.
                <br />
                <strong>{formData.phone}</strong> 번호로 받은 인증번호를 입력해주세요.
              </p>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
                <p className="text-sm text-gray-600">인증번호 전송 중...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>
                    인증번호 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.authNum}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, authNum: e.target.value.replace(/\D/g, '') }))
                    }
                    placeholder="카카오톡으로 받은 인증번호"
                    maxLength={6}
                    autoFocus
                  />
                </div>
                {authCooldown === 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResendAuth}
                    disabled={loading}
                    className="w-full"
                  >
                    인증번호 재요청
                  </Button>
                ) : (
                  <p className="text-sm text-center text-gray-500">{authCooldown}초 후 재요청 가능</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg space-y-3 text-sm">
              <div>
                <span className="text-gray-500">채널 ID</span>
                <p className="font-medium">{formData.plusId}</p>
              </div>
              <div>
                <span className="text-gray-500">채널 별칭</span>
                <p className="font-medium">{formData.name}</p>
              </div>
              <div>
                <span className="text-gray-500">전화번호</span>
                <p className="font-medium">{formData.phone}</p>
              </div>
              <div>
                <span className="text-gray-500">카테고리</span>
                <p className="font-medium">
                  {categories?.firstBusinessType.find((c) => c.code === selectedFirst)?.name} →{' '}
                  {categories?.secondBusinessType.find((c) => c.code === selectedSecond)?.name} →{' '}
                  {categories?.thirdBusinessType.find((c) => c.code === selectedThird)?.name}
                </p>
              </div>
            </div>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                심사 요청 후 카카오의 승인을 받아야 채널을 사용할 수 있어요.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 justify-end mt-4 pt-4 border-t">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading}>
              이전
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            취소
          </Button>
          {step < 3 ? (
            <Button
              onClick={handleNextStep}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2 || loading}
            >
              {loading && step === 1 ? '인증번호 전송 중...' : '다음'}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? '처리 중...' : '심사 요청'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
