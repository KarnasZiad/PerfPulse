# syntax=docker/dockerfile:1.7
# Build context: repository root (docker build -f apps/ingest/Dockerfile .)

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0
RUN corepack enable
WORKDIR /repo

# ---- Build: lockfile install, protocol then service compilation, production-only bundle.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/
COPY apps/ingest/package.json apps/ingest/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @perfpulse/ingest...
COPY packages/protocol packages/protocol
COPY apps/ingest apps/ingest
RUN pnpm --filter @perfpulse/protocol --filter @perfpulse/ingest build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @perfpulse/ingest deploy --prod /out

# ---- Runtime: compiled JavaScript and production dependencies only.
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4100/health/live || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
