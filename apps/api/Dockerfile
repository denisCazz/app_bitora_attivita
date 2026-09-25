# Build context: repository root (docker build -f apps/api/Dockerfile .)
FROM node:22-alpine

RUN apk add --no-cache openssl && npm install -g pnpm@10.33.4

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/api/prisma apps/api/prisma

RUN pnpm install --frozen-lockfile --filter "@rapportini/api..." && pnpm store prune

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN mkdir -p apps/api/uploads && chown -R node:node apps/api/uploads

ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER node
WORKDIR /app/apps/api

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["sh", "-c", "pnpm prisma:deploy && exec node --import tsx src/index.ts"]
