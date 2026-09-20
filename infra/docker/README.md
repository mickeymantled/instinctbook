# infra/docker

Everything needed to build and run ibook's application images, plus the minimal dev/test infra
stack. See the repo root [README.md](../../README.md#run-the-full-stack) for the day-to-day
`pnpm stack:*` commands, the port table, and how to enable the `observability` profile — this
file covers the images and files themselves.

## Files

- `api.Dockerfile` — builds `@ibook/api`.
- `worker.Dockerfile` — builds `@ibook/worker`.
- `web.Dockerfile` — builds `@ibook/web` (Next.js, `output: "standalone"`).
- `otel-collector-config.yaml` — config for the optional `ibook-otel-collector` service
  (`compose.yaml`'s `observability` profile): an OTLP/HTTP receiver piped to the `debug`
  exporter, so spans just print to that container's logs. Not a real tracing backend.
- `compose.dev.yaml` — a separate, minimal Postgres 16 + Redis 7 stack (project `ibook-dev`),
  used for local dev loops and by the integration test suites in `packages/db`, `packages/queue`,
  `apps/api`, and `apps/worker`. `../../compose.yaml` (the full application stack, project
  `ibook`) is independent of this — different project name, different host ports, different
  volumes — the two can run at the same time without conflict.

## Building images

All three Dockerfiles must be built with the **repo root** as the build context (they need the
whole pnpm workspace, not just their own app directory):

```
docker build -f infra/docker/api.Dockerfile    -t ibook-api    .
docker build -f infra/docker/worker.Dockerfile -t ibook-worker .
docker build -f infra/docker/web.Dockerfile    -t ibook-web    .
```

`../../compose.yaml` does exactly this (`build.context: .`, `build.dockerfile:
infra/docker/*.Dockerfile`) — `pnpm stack:up` / `docker compose up --build` are the normal way to
build these, the commands above are for building an image standalone (e.g. to inspect it).

### How the builds work

`api.Dockerfile` and `worker.Dockerfile` share the same four-stage shape:

1. **base** — `node:22.22-alpine` with pnpm pinned to the exact version this repo's
   `package.json` declares (`corepack prepare pnpm@11.3.0 --activate`), so the image always
   installs with the same pnpm the lockfile was produced with.
2. **pruner** — `turbo prune <package> --docker` computes the minimal workspace subset that
   package actually needs: its own source, its workspace dependencies' source, and a
   package.json-only copy of the whole subset for a cacheable install layer.
3. **installer** — installs from the pruned lockfile (a layer that only invalidates when
   dependencies change, not on every source edit), builds the target package with `turbo run
   build --filter=<package>`, then runs `pnpm --filter=<package> deploy --prod --legacy
   /app/deploy`. `pnpm deploy` assembles a single, self-contained, production-only directory:
   the package's own `dist/`, each workspace dependency's own declared `"files"` (for
   `@ibook/db` that includes `migrations/`, which is why the migration files end up in the api
   image even though `apps/api/src/server.ts` never runs migrations itself — see
   `ibook-migrate` in `../../compose.yaml`), and only their production dependencies.
   `--legacy` is required: pnpm 10+ defaults to refusing a "deploy" from a workspace that isn't
   using injected dependencies, and this workspace isn't (see D-019/D-021 in
   `docs/DECISIONS.md` — no decision was needed to change that, since injected-dependency mode
   changes how conflicting peer versions resolve across the whole workspace and isn't something
   this slice needed to take on).
4. **runner** — a fresh `node:22.22-alpine`, non-root (`ibook`, uid/gid `10001`), `NODE_ENV=
   production`, nothing copied in except stage 3's `/app/deploy` output. No pnpm, no turbo, no
   source, no dev dependencies.

`web.Dockerfile` skips the `pnpm deploy` step: Next's `output: "standalone"` (set in
`apps/web/next.config.ts`) already traces and copies only the `node_modules` files the server
actually needs into `.next/standalone` as part of `next build`. The runner stage just copies that
plus the two directories standalone mode intentionally leaves out (`.next/static`, `public/`).

One gotcha common to all three: `turbo prune` follows the `package.json` dependency graph, but
not a `tsconfig.json`'s `"extends": "../../tsconfig.base.json"` — every Dockerfile explicitly
`COPY`s `tsconfig.base.json` (and `turbo.json`) into the installer stage after the pruned source,
or every package's `tsc` build fails with `TS5083: Cannot read file
'/app/tsconfig.base.json'`.

### OpenTelemetry and `--import`

`api.Dockerfile`/`worker.Dockerfile`'s `CMD` starts Node with `--import ./otel-register.mjs`.
That file (`apps/api/otel-register.mjs`, `apps/worker/otel-register.mjs`) registers
`@opentelemetry/instrumentation`'s ESM loader hook during Node's module *preload* phase. This
turned out to not be optional: core-module instrumentation (http/pg/ioredis) works by monkey
patching, and for this repo's ESM (`"type": "module"`, NodeNext) code, that patch only takes
effect for a module's *static* `import`s if the loader hook was registered before Node resolves
that module graph — a plain first-line `import "./instrumentation.js"` inside `server.ts` itself
(the other half of the wiring) is already too late for that part, because Node resolves an ESM
entrypoint's whole static import graph before any of its own top-level code runs. `--import` runs
during the separate preload phase that happens before that resolution starts. Both `otel-
register.mjs` and `src/instrumentation.ts` are needed together; see either file's own comments
for the full explanation, and `packages/observability/vitest.config.ts` for how the same
constraint shows up in that package's own test suite (it needs the same flag to test the real
instrumentation end to end with an in-memory span exporter).

### Non-root, healthchecks, image sizes

Every runner stage creates and switches to a fixed-uid non-root user (`ibook`, `10001:10001`) —
verify with `docker compose exec ibook-api id`. Every long-running service has a `HEALTHCHECK`
using `wget` (part of Alpine's busybox base, no extra package needed) against its own `/healthz`.
Built images are in the 280-350MB range (`docker images | grep ibook`) — mostly `node:22-alpine`
plus each service's own production `node_modules`; `apps/*/dist` still includes compiled test
files (`tsc`'s existing `include: ["src"]` doesn't exclude `*.test.ts`), a pre-existing repo
behavior this slice didn't change.

## ClamAV: image choice and arm64

The task's default suggestion, `clamav/clamav:stable`, only publishes an amd64 image (verified
with `docker manifest inspect`) — no arm64 variant exists. `clamav/clamav-debian:stable` is the
official Cisco Talos multi-arch replacement (amd64 + arm64 + ppc64le) and is what `compose.yaml`
uses. It bundles `/usr/local/bin/clamdcheck.sh` (PING/PONG against `clamd` on port 3310), used
directly as the `HEALTHCHECK`.

It is slow (definitions download on first boot) and memory-hungry — `compose.yaml` gives its
healthcheck a generous `start_period` and `mem_limit: 3g`, and deliberately does not make
`ibook-api`/`ibook-worker` depend on it being healthy (nothing uses it until artifact scanning
ships in a later stage). See the root README's "ClamAV and Colima memory" section for sizing
Colima itself.

## MinIO: registry change

`docker pull minio/minio` from Docker Hub fails outright (`repository does not exist or may
require 'docker login'`) — MinIO stopped publishing there. `quay.io/minio/minio` and
`quay.io/minio/mc` (MinIO's own current recommended registry) are the same images under a
different registry; `compose.yaml` uses those.

## `.dockerignore`

`../../.dockerignore` (repo root, since that's the build context for every Dockerfile here) keeps
`node_modules`, `.git`, `.turbo`, `dist`, `.next`, coverage output, and `docs/` (nothing under
`docs/` is read at build or run time — see `docs/openapi/README.md`: `docs/openapi/` itself is
only touched by the `openapi:generate`/`openapi:check` CLI scripts, which never run inside a
Docker build) out of every image's build context. It also excludes `.env*` (keeping
`.env.example`), so a real `.env` file can never be sent to the Docker daemon even by accident.

## infra/terraform

See [`../terraform/README.md`](../terraform/README.md) — intentionally just a placeholder for
now.
