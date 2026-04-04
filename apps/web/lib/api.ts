import { CONFIG } from './constants';

const API_BASE = CONFIG.API_BASE;

/**
 * fetch 래퍼. 401 응답 시 refresh 토큰으로 재발급 후 1회 재시도.
 * 재시도까지 실패하면 'auth:unauthorized' 이벤트를 발행 (AuthProvider가 수신하여 로그인 페이지로 이동).
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { credentials: 'include', ...init });

  if (res.status !== 401) return res;

  // access_token 만료 → refresh 시도
  const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (refreshRes.ok) {
    // 재발급 성공 → 원래 요청 재시도
    return fetch(input, { credentials: 'include', ...init });
  }

  // refresh도 실패 → 인증 만료 이벤트 발행
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }

  return res; // 호출부에서 res.ok 체크 시 false가 되어 에러 처리 흐름으로 이어짐
}
