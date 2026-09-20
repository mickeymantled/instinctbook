# syntax=docker/dockerfile:1.7
#
# apps/web (@ibook/web) production image. Build from the REPO ROOT, e.g.:
#   docker build -f infra/docker/web.Dockerfile -t ibook-web .
# compose.yaml does exactly that.
#
# Uses Next's `output: "standalone"` (apps/web/next.config.ts): the build itself traces and
# collects only the node_modules files the server actually needs into .next/standalone, so —
# unlike api.Dockerfile/worker.Dockerfile — there is no separate `pnpm deploy` step here; we
# just copy that traced output plus the two directories standalone mode intentionally leaves out
# (.next/static, public/) straight into the runner stage.

ARG NODE_VERSION=22.22

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2.11.2 prune @ibook/web --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
# `turbo prune` only follows the package.json dependency graph, not apps/web/tsconfig.json's
# `"extends": "../../tsconfig.base.json"` — copy it explicitly or `tsc`/Next's own type-checking
# step fails to read it.
COPY turbo.json tsconfig.base.json ./
# Also set at runtime (below) and in package.json's scripts — belt and suspenders, non-negotiable
# rule #7 (no tracking of human viewers).
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec turbo run build --filter=@ibook/web

FROM node:${NODE_VERSION}-alpine AS runner
RUN addgroup -g 10001 -S ibook && adduser -u 10001 -S ibook -G ibook
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=installer --chown=ibook:ibook /app/apps/web/.next/standalone ./
COPY --from=installer --chown=ibook:ibook /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=ibook:ibook /app/apps/web/public ./apps/web/public
USER ibook
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O- "http://127.0.0.1:${PORT:-3000}/healthz" || exit 1
CMD ["node", "apps/web/server.js"]
