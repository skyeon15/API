# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies for the whole monorepo
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
RUN npm install

# Copy source and build
COPY . .
RUN npm run build --workspace=web

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create unprivileged user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy needed assets
COPY --from=builder /app/apps/web/public ./apps/web/public

# Set permission for prerender cache
RUN mkdir -p /app/apps/web/.next
RUN chown nextjs:nodejs /app/apps/web/.next

# Copy standalone output
# Next.js standalone outputs to .next/standalone/apps/web/...
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 10150

ENV PORT=10150
# To bind to all interfaces in container
ENV HOSTNAME="0.0.0.0"

# Main entry point for standalone mode
CMD ["node", "apps/web/server.js"]
