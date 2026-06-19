import { CONFIG } from '../constants.js';

/**
 * 요청이 실제로 들어온 공개 오리진을 기준으로 외부 공개 API 베이스 URL을 만든다.
 * (리버스 프록시 뒤이므로 x-forwarded-* 헤더를 우선 사용. trust proxy 활성화 전제.)
 *
 * 웹(Next.js)이 /api/:path* 를 API로 rewrite(=/api 프리픽스를 떼고 전달)하므로,
 * 브라우저·외부에서 보는 공개 API 경로는 `{origin}/api/...` 이다. API 자신은 프리픽스를
 * 받지 못하니, x-forwarded-prefix 가 없으면 웹 컨벤션인 '/api' 를 붙여 복원한다.
 *
 * 반환 예: `https://example.com/api`
 */
export function resolveApiBaseUrl(req: any): string {
  const proto =
    (req?.headers?.['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
    req?.protocol ||
    'https';
  const host =
    (req?.headers?.['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
    req?.headers?.host;
  if (!host) return CONFIG.API_URL;
  const prefix = (
    (req?.headers?.['x-forwarded-prefix'] as string) ?? '/api'
  ).replace(/\/$/, '');
  return `${proto}://${host}${prefix}`;
}
