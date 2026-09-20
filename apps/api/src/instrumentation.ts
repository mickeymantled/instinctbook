import {
  createFastifyOtelInstrumentation,
  type FastifyOtelInstrumentation,
  initTelemetry,
  type ShutdownTelemetry,
} from "@ibook/observability";

// Matches this package's package.json "version" field (kept as a literal so the built dist/
// entrypoint doesn't need to read package.json at runtime).
const SERVICE_VERSION = "0.0.0";

const otelEnabled =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT !== undefined &&
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT.length > 0;

/**
 * `@fastify/otel` is both an OpenTelemetry `Instrumentation` (registered below via
 * `initTelemetry`'s `extraInstrumentations`) and a Fastify plugin (registered on the app
 * instance in app.ts). Both roles must share this one instance. `undefined` when telemetry is
 * disabled, so app.ts skips registering the plugin entirely.
 */
export const fastifyOtelInstrumentation: FastifyOtelInstrumentation | undefined = otelEnabled
  ? createFastifyOtelInstrumentation()
  : undefined;

/**
 * Side effect: initialises OpenTelemetry (no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset).
 * Must run before any module that imports http/pg/ioredis — this file is imported as the very
 * first statement in src/server.ts. Core-module instrumentation additionally requires the ESM
 * loader hook registered by ../otel-register.mjs (loaded via `node --import`, see package.json's
 * `start` script and infra/docker/api.Dockerfile) to be active before *that* import graph is
 * resolved; this module alone is not sufficient for a process started without that flag.
 */
export const shutdownTelemetry: ShutdownTelemetry = initTelemetry({
  serviceName: process.env.SERVICE_NAME ?? "ibook-api",
  serviceVersion: SERVICE_VERSION,
  env: process.env.NODE_ENV ?? "development",
  extraInstrumentations: fastifyOtelInstrumentation ? [fastifyOtelInstrumentation] : [],
});
