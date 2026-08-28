/**
 * 우편번호 찾기 (다음 우편번호 서비스).
 *
 * 주소를 손으로 적게 두면 «서울시 강남구 테헤란로 1」처럼 제각각으로 들어와
 * 배송·정산에서 쓸 수 없다. 우편번호는 더 심해서, 5자리를 틀리면 배송이 안 간다.
 *
 * 스크립트는 반드시 다음 CDN 에서 받아야 한다(자체 호스팅 불가).
 * 무료이고 키가 필요 없다.
 */

const SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

export type PostcodeResult = {
  /** 5자리 우편번호 */
  zonecode: string;
  /** 도로명 주소(없으면 지번). 건물명이 있으면 괄호로 붙인다 */
  address: string;
};

type DaumPostcodeData = {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  autoRoadAddress?: string;
  autoJibunAddress?: string;
  buildingName?: string;
  apartment?: 'Y' | 'N';
  userSelectedType?: 'R' | 'J';
};

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: DaumPostcodeData) => void;
        onclose?: (state: 'FORCE_CLOSE' | 'COMPLETE_CLOSE') => void;
      }) => { open: () => void };
    };
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();
  // 두 번 부르면 태그가 두 개 생긴다. 처음 만든 약속을 계속 돌려준다.
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      // 실패하면 다음 시도가 다시 붙을 수 있게 약속을 비운다
      loading = null;
      reject(new Error('우편번호 서비스를 불러오지 못했어요.'));
    };
    document.head.appendChild(el);
  });
  return loading;
}

/**
 * 검색 창을 띄우고 고른 주소를 돌려준다.
 * 그냥 닫으면 `null` — 오류가 아니므로 호출부는 아무 것도 하지 않으면 된다.
 */
export async function openPostcodeSearch(): Promise<PostcodeResult | null> {
  await loadScript();
  const Postcode = window.daum?.Postcode;
  if (!Postcode) throw new Error('우편번호 서비스를 불러오지 못했어요.');

  return new Promise<PostcodeResult | null>((resolve) => {
    let picked: PostcodeResult | null = null;

    new Postcode({
      oncomplete: (data) => {
        // 사용자가 고른 방식(도로명/지번)을 따르고, 안 골랐으면 도로명을 쓴다
        const base =
          data.userSelectedType === 'J'
            ? data.jibunAddress
            : data.roadAddress || data.jibunAddress;

        // 아파트·건물명은 있으면 붙여 준다 — 「(무슨무슨아파트)」가 있어야 기사가 찾는다
        const building =
          data.buildingName && data.apartment === 'Y' ? ` (${data.buildingName})` : '';

        picked = { zonecode: data.zonecode, address: `${base}${building}` };
      },
      // 창이 닫힐 때 한 번만 정리한다. 고르지 않고 닫으면 null 이다.
      onclose: () => resolve(picked),
    }).open();
  });
}
