# syntax=docker/dockerfile:1.7
# Build context: repository root (docker build -f apps/processor/Dockerfile .)
# One image, three commands: the consumer (default), the migrations and the project CLI.

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
COPY apps/processor/package.json apps/processor/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @perfpulse/processor...
COPY packages/protocol packages/protocol
COPY apps/processor apps/processor
RUN pnpm --filter @perfpulse/protocol --filter @perfpulse/processor build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @perfpulse/processor deploy --prod /out

# ---- Runtime: compiled JavaScript, production dependencies and SQL migrations only.
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
ENTRYPOINT ["/sbin/tini", "--"]
# Migrations: node dist/cli/migrate.js
# New project: node dist/cli/create-project.js --name <name> --slug <slug> --origin <https://…>
CMD ["node", "dist/main.js"]
