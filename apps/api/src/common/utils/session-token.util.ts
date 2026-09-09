/**
 * 액세스 토큰의 종류를 가른다.
 *
 * 세션 토큰(브라우저 쿠키)과 SSO 액세스 토큰(연동 서비스가 토큰 교환으로 받는 것)은
 * 지금까지 `{ sub }` 하나로 똑같이 생겨서 서로 구분되지 않았다. 그래서 연동 서비스가
 * 받은 토큰을 `Cookie: access_token=...` 으로 붙이면 본인 전용 API(프로필 전체·연동 해제
 * ·결제)가 그대로 열렸다 — scope 동의가 우회된다.
 *
 * 그래서 SSO 쪽에만 `typ: 'sso'` 표식을 넣는다. 표식이 없는 토큰은 세션으로 본다
 * (배포 전에 발급된 토큰이 15분 남아 있는데, 그것들을 한꺼번에 끊지 않기 위해서다).
 */
export const SSO_TOKEN_TYPE = 'sso';

export type AccessTokenPayload = {
  sub: string;
  /** 'sso' 면 연동 서비스용 토큰. 없으면 브라우저 세션 토큰 */
  typ?: string;
  /** SSO 토큰에만: 발급 대상 클라이언트 */
  aud?: string;
  /** SSO 토큰에만: 동의받은 scope (공백 구분) */
  scope?: string;
};

/** 브라우저 세션으로 인정할 수 있는 토큰인지 */
export function isSessionToken(payload: unknown): payload is AccessTokenPayload {
  const p = payload as AccessTokenPayload | null;
  return Boolean(p?.sub) && p?.typ !== SSO_TOKEN_TYPE;
}

/** 연동 서비스에 발급된 SSO 액세스 토큰인지 */
export function isSsoToken(payload: unknown): payload is AccessTokenPayload {
  const p = payload as AccessTokenPayload | null;
  return Boolean(p?.sub) && p?.typ === SSO_TOKEN_TYPE;
}
