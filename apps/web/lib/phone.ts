/**
 * 국가코드 + 전화번호 입력 보조.
 *
 * 저장 형식은 API(`common/utils/phone.util.ts`)와 같다 — 국내는 `01012345678`,
 * 해외는 E.164(`+14155550123`). 폼에서는 (국가, 국내표기) 두 값으로 나눠 받고
 * 보낼 때 E.164 로 합친다. 국가 판정·유효성은 libphonenumber-js 에 맡긴다.
 */
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export type { CountryCode };

export const DEFAULT_COUNTRY: CountryCode = 'KR';

export type CountryOption = {
  code: CountryCode;
  /** 국가번호 (예: '82') */
  callingCode: string;
  name: string;
  flag: string;
};

// 국가 이름은 브라우저/노드의 ICU 에서 가져온다 — 240여 개 목록을 손으로 들고 있으면
// 반드시 낡는다. ICU 가 없는 환경이면 ISO 코드로 떨어뜨린다.
const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['ko'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** 'KR' -> 🇰🇷 (ISO 코드 두 글자를 지역 표시 기호로 옮긴다) */
function toFlag(code: string): string {
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export const COUNTRY_OPTIONS: CountryOption[] = getCountries()
  .map((code) => ({
    code,
    callingCode: getCountryCallingCode(code),
    name: regionNames?.of(code) ?? code,
    flag: toFlag(code),
  }))
  // 대부분이 국내 사용자라 한국을 맨 위에 둔다.
  .sort((a, b) => {
    if (a.code === DEFAULT_COUNTRY) return -1;
    if (b.code === DEFAULT_COUNTRY) return 1;
    return a.name.localeCompare(b.name, 'ko');
  });

/** (국가, 입력값)을 서버로 보낼 E.164 로 만든다. 번호가 유효하지 않으면 null. */
export function toE164(
  country: CountryCode,
  input: string,
): string | null {
  const parsed = parsePhoneNumberFromString(input ?? '', country);
  return parsed?.isValid() ? parsed.number : null;
}

/** 저장된 번호를 (국가, 국내표기)로 되돌린다. 폼 선채움용. */
export function splitPhone(stored?: string | null): {
  country: CountryCode;
  national: string;
} {
  const parsed = stored
    ? parsePhoneNumberFromString(stored, DEFAULT_COUNTRY)
    : null;
  if (!parsed) return { country: DEFAULT_COUNTRY, national: stored ?? '' };
  return {
    country: parsed.country ?? DEFAULT_COUNTRY,
    national: parsed.formatNational(),
  };
}
