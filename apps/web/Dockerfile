# syntax=docker/dockerfile:1.7
# Build context: repository root (docker build -f apps/web/Dockerfile .)

FROM node:22-alpine AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @perfpulse/web...
# Vite reads the protocol from its sources (@perfpulse/source condition): no separate build.
COPY packages/protocol packages/protocol
COPY apps/web apps/web
# Source maps stay out of the image: they would publish the sources for no benefit in production.
RUN pnpm --filter @perfpulse/web build \
 && find apps/web/dist -name '*.map' -delete

# ---- Runtime: static files only, Nginx running as an unprivileged user.
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# The base image already runs as nginx (uid 101); stating it keeps the guarantee explicit.
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
