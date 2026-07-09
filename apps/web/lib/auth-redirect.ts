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
    const authUrl = new URL(`${apiBase}/auth/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);
    return { external: authUrl.toString() };
  }

  return { internal: redirectPath };
}
