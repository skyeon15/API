import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * 전화번호 저장 형식을 한 곳에서 정한다.
 *
 * 국내(+82) 번호는 예전 그대로 `01012345678` 국내 표기로 저장한다 — 알리고 SMS·알림톡과
 * PayApp 이 국내 표기만 받으므로 여기를 E.164 로 바꾸면 발송·결제가 통째로 깨지고,
 * 이미 쌓인 users.phone 도 전부 이 형태다.
 *
 * 해외 번호는 국가를 잃지 않게 E.164(`+14155550123`)로 저장한다.
 * 따라서 저장된 값이 `+` 로 시작하면 해외 번호다.
 *
 * `+` 가 없는 입력은 국내 표기로 본다 — 기존 데이터와 기존 호출부가 전부 그 형태다.
 *
 * @returns 저장 형식으로 정규화한 번호. 형식이 틀리면 null.
 */
export function parsePhone(raw: string | null | undefined): string | null {
  const input = String(raw ?? '').trim();
  if (!input) return null;

  const parsed = parsePhoneNumberFromString(
    input,
    input.startsWith('+') ? undefined : 'KR',
  );
  if (!parsed?.isValid()) return null;

  // country 는 +1(US/CA)처럼 여러 나라가 공유하면 비어 있을 수 있다. 국가번호로 판정한다.
  // formatNational() 은 지역번호의 앞 0 을 살려 준다(02-…, 010-…).
  return parsed.countryCallingCode === '82'
    ? parsed.formatNational().replace(/\D/g, '')
    : parsed.number;
}
