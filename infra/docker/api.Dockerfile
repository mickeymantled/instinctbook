# syntax=docker/dockerfile:1.7
#
# apps/api (@ibook/api) production image. Build from the REPO ROOT so the whole workspace
# (needed by `turbo prune`/pnpm workspace resolution) is in the build context, e.g.:
#   docker build -f infra/docker/api.Dockerfile -t ibook-api .
# compose.yaml does exactly that. See infra/docker/README.md for the full rationale.
#
# This same image also runs the one-shot `ibook-migrate` service (compose.yaml), which
# overrides the default command to run `packages/db/dist/migrate-cli.js` instead — that's why
# packages/db/migrations ends up in this image even though the api process itself never touches
# migrations at runtime (server.ts explicitly never runs migrations as a boot side effect).

ARG NODE_VERSION=22.22

# ---------------------------------------------------------------------------
# base: pinned Node + pnpm (via corepack), shared by every later stage.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS base
# Pin the exact pnpm version this repo declares (package.json "packageManager"), rather than
# whatever corepack would otherwise resolve, so a Docker build always uses the same pnpm the
# repo's lockfile was produced with.
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# pruner: computes the minimal workspace subset @ibook/api actually needs (source + a
# lockfile/package.json-only subset for a cacheable install layer), via `turbo prune`.
# ---------------------------------------------------------------------------
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2.11.2 prune @ibook/api --docker

# ---------------------------------------------------------------------------
# installer: installs deps from the pruned lockfile (cacheable independently of source changes),
# then copies in the pruned source and builds only @ibook/api and what it depends on.
# ---------------------------------------------------------------------------
FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Non-interactive: no local package store/cache to reuse inside a fresh build stage, and no TTY
# to confirm anything against — frozen-lockfile is also the correctness guarantee (build fails
# loudly on drift instead of silently re-resolving).
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
# `turbo prune` only follows the package.json dependency graph, not each package's
# `tsconfig.json`'s `"extends": "../../tsconfig.base.json"` — copy it explicitly or every
# package's `tsc` build fails with TS5083 (cannot read tsconfig.base.json).
COPY turbo.json tsconfig.base.json ./
RUN pnpm exec turbo run build --filter=@ibook/api

# `pnpm deploy` assembles a single self-contained, production-only directory for @ibook/api:
# its own dist/, its workspace dependencies (each package's own "files" — e.g. packages/db's
# "dist" + "migrations", see packages/db/package.json), and only their production dependencies.
# pnpm 10+ refuses non-"injected" workspace deploys by default; --legacy opts back into the
# plain (non-injected) implementation, which is what actually works for this workspace layout —
# see docs/BUILD_PROMPT.md slice 1.5 item 3 ("pnpm 11 may need --legacy").
RUN pnpm --filter=@ibook/api deploy --prod --legacy /app/deploy

# ---------------------------------------------------------------------------
# runner: minimal production image — only the deployed output, no pnpm/turbo/source.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
RUN addgroup -g 10001 -S ibook && adduser -u 10001 -S ibook -G ibook
WORKDIR /app
ENV NODE_ENV=production
COPY --from=installer --chown=ibook:ibook /app/deploy /app
USER ibook
EXPOSE 3000
# wget is part of alpine's busybox base (no extra package needed). Uses the container's own
# internal port, independent of whatever host port compose.yaml publishes it under.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O- "http://127.0.0.1:${PORT:-3000}/healthz" || exit 1
# `--import ./otel-register.mjs` registers OpenTelemetry's ESM loader hook during Node's
# preload phase — required for core-module (http/pg) instrumentation to work at all when
# OTEL_EXPORTER_OTLP_ENDPOINT is set; a harmless no-op otherwise. See otel-register.mjs and
# src/instrumentation.ts (imported first by dist/server.js) for the full explanation.
CMD ["node", "--import", "./otel-register.mjs", "dist/server.js"]
