# Deps stage: production-only node_modules
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci --omit=dev

# Build stage
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci
COPY . .
RUN npm run build --workspace=api

# Production stage
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs

# Production node_modules (devDependencies 제외)
COPY --from=deps /app/node_modules ./node_modules

# Built application
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

# ServeStaticModule이 process.cwd()/public = /app/public을 바라봄
COPY --from=builder /app/apps/api/public ./public

USER nestjs

EXPOSE 10151

CMD ["node", "apps/api/dist/main"]
