/**
 * SSO scope 를 사람 말로 옮긴다.
 *
 * 화면에 `openid`·`profile` 같은 원문을 그대로 띄우면 «이 서비스에 내 무엇이
 * 넘어가는가»를 알 수 없다. 연결된 서비스 목록과 관리 콘솔이 같은 말을 쓰도록
 * 여기 한 곳에 모은다.
 *
 * `detail` 은 실제로 넘어가는 항목이다 — `auth.service.ts` 의 issueIdToken 이
 * scope 별로 싣는 클레임과 맞춰 둘 것. 한쪽만 바뀌면 화면이 거짓말을 한다.
 */

export type ScopeInfo = {
  value: string;
  /** 배지처럼 좁은 자리에 쓰는 짧은 이름 */
  label: string;
  /** 실제로 넘어가는 항목 */
  detail: string;
  /** openid 는 OIDC 필수라 끌 수 없다 */
  required?: boolean;
};

export const SCOPE_OPTIONS: ScopeInfo[] = [
  { value: 'openid', label: '회원 식별', detail: '회원 고유 번호', required: true },
  { value: 'profile', label: '기본 프로필', detail: '이름 · 닉네임 · 프로필 사진 · 생년월일' },
  { value: 'email', label: '이메일', detail: '이메일 주소' },
  { value: 'phone', label: '전화번호', detail: '휴대전화 번호' },
  { value: 'address', label: '주소', detail: '주소 · 우편번호' },
];

const BY_VALUE = new Map(SCOPE_OPTIONS.map((s) => [s.value, s]));

/** 모르는 scope 는 원문을 그대로 돌려준다 — 빈칸으로 두면 무엇이 넘어가는지 감춰진다 */
export function scopeLabel(scope: string): string {
  return BY_VALUE.get(scope)?.label ?? scope;
}

export function scopeDetail(scope: string): string {
  return BY_VALUE.get(scope)?.detail ?? scope;
}
