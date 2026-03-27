'use client';

import { useState } from 'react';

interface Button {
  name: string;
  linkType?: string;
  linkMo?: string;
  linkPc?: string;
  linkAnd?: string;
  linkIos?: string;
  [key: string]: any;
}

interface AlimtalkPreviewProps {
  headerTitle?: string;
  title?: string;
  subtitle?: string;
  content: string;
  buttons?: Button[];
  emtype?: '기본형' | '강조표기형' | '이미지형';
}

export default function AlimtalkPreview({
  headerTitle,
  title,
  subtitle,
  content,
  buttons = [],
  emtype = '기본형',
}: AlimtalkPreviewProps) {
  const [toggledButtons, setToggledButtons] = useState<Set<number>>(new Set());

  const toggleButton = (idx: number) => {
    const newSet = new Set(toggledButtons);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    setToggledButtons(newSet);
  };

  const isEmphasis = emtype === '강조표기형' || (!!title && !!subtitle);
  const displayHeader = headerTitle || '알림톡';

  return (
    <div className="bg-[#bacee0] p-4 rounded-xl min-h-[400px]">
      <div className="bg-white rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 text-sm font-bold text-gray-900 border-b border-gray-100 bg-[#fae100]">
          {displayHeader}
        </div>

        <div className="p-4 space-y-4">
          {isEmphasis && (
            <div>
              {subtitle && <div className="text-gray-500 text-sm mb-1">{subtitle}</div>}
              {title && <div className="font-bold text-2xl text-black leading-tight">{title}</div>}
            </div>
          )}

          {isEmphasis && <hr className="border-gray-100" />}

          {content && (
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{content}</div>
          )}
        </div>

        {buttons && buttons.length > 0 && (
          <div className="border-t border-gray-100 bg-[#f7f7f7]">
            {buttons.map((btn, idx) => {
              const isToggled = toggledButtons.has(idx);
              const link = btn.linkMo || btn.linkPc || btn.linkAnd || btn.linkIos;

              return (
                <div key={idx} className="border-b border-gray-200 last:border-b-0">
                  <div
                    className="w-full py-3 text-center text-sm text-gray-700 font-medium hover:bg-gray-100 cursor-pointer break-all px-2"
                    onClick={() => link && toggleButton(idx)}
                  >
                    {isToggled && link ? (
                      <span className="text-blue-600 text-xs">{link}</span>
                    ) : (
                      btn.name
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
