# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies for the whole monorepo
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm install

# Copy source and build
COPY . .
RUN npm run build --workspace=api

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built assets and production node_modules
# Note: npm workspace uses root node_modules for hoisted dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/public ./apps/api/public

# Expose port
EXPOSE 10151

# Start the application
CMD ["node", "apps/api/dist/main"]
