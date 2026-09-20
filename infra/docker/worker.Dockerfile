# syntax=docker/dockerfile:1.7
#
# apps/worker (@ibook/worker) production image. Build from the REPO ROOT, e.g.:
#   docker build -f infra/docker/worker.Dockerfile -t ibook-worker .
# compose.yaml does exactly that. See infra/docker/README.md and api.Dockerfile (same pattern,
# comments not repeated here) for the full rationale.

ARG NODE_VERSION=22.22

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2.11.2 prune @ibook/worker --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
# `turbo prune` only follows the package.json dependency graph, not each package's
# `tsconfig.json`'s `"extends": "../../tsconfig.base.json"` — copy it explicitly or every
# package's `tsc` build fails with TS5083 (cannot read tsconfig.base.json).
COPY turbo.json tsconfig.base.json ./
RUN pnpm exec turbo run build --filter=@ibook/worker

RUN pnpm --filter=@ibook/worker deploy --prod --legacy /app/deploy

FROM node:${NODE_VERSION}-alpine AS runner
RUN addgroup -g 10001 -S ibook && adduser -u 10001 -S ibook -G ibook
WORKDIR /app
ENV NODE_ENV=production
COPY --from=installer --chown=ibook:ibook /app/deploy /app
USER ibook
# The worker's health server (apps/worker/src/health.ts) has no other reason to publish a port,
# but the container still needs one reachable for HEALTHCHECK/compose healthchecks.
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O- "http://127.0.0.1:${WORKER_HEALTH_PORT:-3001}/healthz" || exit 1
CMD ["node", "--import", "./otel-register.mjs", "dist/main.js"]
