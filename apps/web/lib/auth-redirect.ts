// 로그인/가입 완료 후 이동할 목적지 계산.
// 일반 흐름은 내부 경로로, OIDC 흐름(client_id+redirect_uri)은 API authorize URL로 이동한다.
// login·register 페이지가 동일 로직을 공유하도록 분리한다.

export type PostAuthDestination =
  | { external: string }
  | { internal: string };

export function resolvePostAuthDestination(
  params: URLSearchParams,
  apiBase: string,
): PostAuthDestination {
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const scope = params.get('scope') || 'openid profile';
  const state = params.get('state') || '';
  const redirectPath = params.get('redirect') || '/profile';

  if (clientId && redirectUri) {
    // 🔴 URL 객체로 조립하지 않는다. apiBase 는 rewrites 를 타는 상대경로('/api')라
    //    new URL('/api/auth/authorize') 가 base 없이 불려 TypeError 로 터졌다.
    //    그 예외가 useEffect 안에서 잡히지 않아 로그인 페이지가 통째로
    //    "Application error: a client-side exception" 으로 죽었다.
    //    이동은 window.location.href 로 하므로 상대경로 그대로 넘겨도 브라우저가 푼다.
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      state,
    });
    return { external: `${apiBase}/auth/authorize?${query.toString()}` };
  }

  return { internal: redirectPath };
}
