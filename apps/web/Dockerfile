# Build stage
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
RUN npm ci
COPY . .

# Next.js NEXT_PUBLIC_* 변수는 빌드 시점에 클라이언트 번들로 인라인되므로
# CI(GitHub Actions)에서 Doppler로부터 가져와 --build-arg로 전달해야 한다.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEB_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL}

RUN npm run build --workspace=web

# Production stage
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public

RUN mkdir -p /app/apps/web/.next && chown nextjs:nodejs /app/apps/web/.next

# Next.js standalone 출력물 (prod node_modules 포함)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 10150
ENV PORT=10150
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
