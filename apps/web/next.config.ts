import type { NextConfig } from "next";

// 브라우저는 항상 상대경로(/api/*)로 호출하고(CONFIG.API_BASE), web 서버가 이를 API로
// 리버스프록시한다. 따라서 이 값은 브라우저에 노출될 필요가 없는 '서버사이드 내부 타깃'이다.
// 단일 컨테이너에서는 같은 컨테이너의 API(10151)로 보내므로 기본값이 localhost.
// rewrites()는 next start 시점에 평가되므로 런타임 env로 충분하다(빌드 주입 불필요).
const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:10151';

const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_PROXY_TARGET}/:path*`,
      },
    ];
  },
};

export default nextConfig;
