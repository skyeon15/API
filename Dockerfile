# Root Dockerfile for Monorepo Compatibility
# This file is provided for tools or scripts that expect a Dockerfile in the root.
# To build a specific app, please use:
#   docker-compose build
# or:
#   docker build -f apps/api/Dockerfile .
#   docker build -f apps/web/Dockerfile .

# By default, this Dockerfile builds the API app.
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm install
COPY . .
RUN npm run build --workspace=api

FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
EXPOSE 10151
CMD ["node", "apps/api/dist/main"]
