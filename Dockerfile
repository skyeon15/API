# 단일 이미지: 한 컨테이너에서 NestJS API(10151) + Next.js web(10150)을 동시 구동.
# web(next.config rewrites)이 /api/* 를 API로 리버스프록시하므로 두 서버 모두 살아있어야 한다.
# 빌드: docker build -t ghcr.io/skyeon15/api . (또는 ./build.sh)

# ── deps: 런타임(prod) node_modules ──────────────────────────────────────────
# api(@nestjs...)·web(next/react) 런타임 의존성이 모두 루트로 호이스팅된 superset.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci --omit=dev

# ── builder: 전체 설치 후 api/web 둘 다 빌드 ─────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci
COPY . .

# Next.js NEXT_PUBLIC_* 는 빌드 시점에 클라이언트 번들로 인라인됨 → build-arg로 주입.
# (web→api 프록시 타깃은 브라우저에 노출되지 않는 서버사이드 값이라 여기서 다루지 않는다.
#  next.config.ts가 API_PROXY_TARGET 런타임 env로 처리하며 기본값이 localhost:10151.)
ARG NEXT_PUBLIC_WEB_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL} \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}

RUN npm run build --workspace=api && npm run build --workspace=web

# ── runner: 두 빌드 산출물 + prod node_modules 합본 ──────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
# GHCR 패키지를 API 레포에 자동 연결 → 레포 가시성/권한 상속, 패키지 페이지에 노출.
LABEL org.opencontainers.image.source=https://github.com/skyeon15/API
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# 비루트(app) 사용자에서 doppler 버전체크/분석 파일 쓰기 시도 억제
ENV DOPPLER_ENABLE_VERSION_CHECK=false

# entrypoint의 `wait -n`(견고한 다중 프로세스/시그널 처리)을 위해 bash 설치.
# doppler CLI: 런타임에 DOPPLER_TOKEN(Coolify가 주입)만 있으면 entrypoint가
#   `doppler run`으로 prd config 시크릿 전체를 process.env에 채운다.
RUN apk add --no-cache bash curl gnupg \
 && (curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh | sh) \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 app

# 런타임 의존성 (api·web 공용 superset)
COPY --from=deps /app/node_modules ./node_modules

# API 산출물
COPY --from=builder --chown=app:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
# ServeStaticModule이 process.cwd()/public = /app/public 을 바라봄
COPY --from=builder /app/apps/api/public ./public

# Web 산출물 (next start 로 구동 → .next + public + package.json 필요)
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=app:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R app:nodejs /app

USER app
EXPOSE 10150 10151

# web(10150) → /api/health 리버스프록시 → API /health(DB+Redis readiness)로 컨테이너 상태 판정.
# 한 엔드포인트로 web 프로세스·프록시·API readiness를 모두 검증한다(둘 중 하나라도 죽으면 비정상).
# terminus는 비정상일 때 503을 반환하므로 curl -f가 실패(비0)로 처리한다.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:10150/api/health || exit 1

CMD ["./docker-entrypoint.sh"]
