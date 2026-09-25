# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

FROM base AS builder
RUN apk add --no-cache libc6-compat python3 make g++ linux-headers
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

COPY . ./
RUN pnpm run build

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat

LABEL org.opencontainers.image.title="10router"

ENV NODE_ENV=production
ENV PORT=20128
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_DIR=/app/data
ENV HOME=/home/node

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/custom-server.js ./custom-server.js
COPY --from=builder --chown=node:node /app/open-sse ./open-sse
# Ensure `next` is available at runtime in case tracing did not include it.
COPY --from=builder --chown=node:node /app/node_modules/next ./node_modules/next
# sql.js loads dist/sql-wasm.wasm by path at runtime; tracing only follows JS imports,
# so the last-resort DB driver would abort with ENOENT on the missing binary.
COPY --from=builder --chown=node:node /app/node_modules/sql.js ./node_modules/sql.js
# node-machine-id is createRequire-loaded at runtime; tracing omits it.
COPY --from=builder --chown=node:node /app/node_modules/node-machine-id ./node_modules/node-machine-id

RUN mkdir -p /app/data /home/node/.10router && chown -R node:node /app/data /home/node/.10router

VOLUME /app/data

USER node

EXPOSE 20128

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:20128/api/health || exit 1

STOPSIGNAL SIGTERM

CMD ["node", "custom-server.js"]
