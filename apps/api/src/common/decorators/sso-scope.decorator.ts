import { SetMetadata } from '@nestjs/common';

export const SSO_SCOPES_KEY = 'ssoScopes';

/**
 * 이 라우트를 부르려면 SSO 액세스 토큰에 이 scope 가 모두 있어야 한다.
 * 동의 없이 열리는 문을 만들지 않으려고 가드가 아니라 라우트마다 적어 둔다.
 */
export const SsoScopes = (...scopes: string[]) => SetMetadata(SSO_SCOPES_KEY, scopes);
