// Registers `@opentelemetry/instrumentation`'s ESM loader hook (backed by `import-in-the-middle`)
// during Node's module *preload* phase, so it is active before this process's own entrypoint
// module graph (server.js -> ... -> pg/ioredis/http) is even resolved.
//
// This is *not* optional when OpenTelemetry is enabled: core/CJS modules like `http`, `pg`, and
// `ioredis` are instrumented by monkey-patching, and for statically `import`ed ESM code that
// patch only takes effect if the loader hook was registered before Node resolves the static
// import graph — which for a plain top-of-file `import "./instrumentation.js"` (the other half
// of this wiring, see src/instrumentation.ts) is already too late. Hence this separate file,
// loaded via `node --import ./otel-register.mjs`, per docs/BUILD_PROMPT.md slice 1.5 item 2
// ("loaded first from the entrypoints (or via node --import)") — see package.json's `start`
// script and infra/docker/api.Dockerfile.
//
// Harmless when OpenTelemetry is disabled (no OTEL_EXPORTER_OTLP_ENDPOINT): this only registers
// the hook machinery, it does not patch anything by itself — nothing calls `Instrumentation#enable()`
// unless src/instrumentation.ts's `initTelemetry()` actually builds and starts an SDK.
//
// `@opentelemetry/instrumentation` must be a DIRECT dependency of this package (see
// package.json), not just a transitive one pulled in through @ibook/observability: this file
// resolves it starting from its own location (a plain file sitting next to dist/ and
// node_modules/, outside any package's own module graph), and pnpm's default node_modules
// layout only makes a dependency resolvable there if it is hoisted to this package's own
// top-level node_modules — which only happens for direct dependencies.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("@opentelemetry/instrumentation/hook.mjs", pathToFileURL("./"));
