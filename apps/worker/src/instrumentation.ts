import { initTelemetry, type ShutdownTelemetry } from "@ibook/observability";

// Matches this package's package.json "version" field (kept as a literal so the built dist/
// entrypoint doesn't need to read package.json at runtime).
const SERVICE_VERSION = "0.0.0";

/**
 * Side effect: initialises OpenTelemetry (no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset).
 * Must run before any module that imports http/pg/ioredis — this file is imported as the very
 * first statement in src/main.ts. Core-module instrumentation additionally requires the ESM
 * loader hook registered by ../otel-register.mjs (loaded via `node --import`, see package.json's
 * `start` script and infra/docker/worker.Dockerfile) to be active before *that* import graph is
 * resolved; this module alone is not sufficient for a process started without that flag.
 *
 * Unlike apps/api, the worker has no Fastify app to attach a framework-level instrumentation
 * to — its http/pg/ioredis instrumentation (BullMQ's Redis traffic, the plain node:http health
 * server, and any Postgres access) is the shared core set `initTelemetry` always builds.
 */
export const shutdownTelemetry: ShutdownTelemetry = initTelemetry({
  serviceName: process.env.SERVICE_NAME ?? "ibook-worker",
  serviceVersion: SERVICE_VERSION,
  env: process.env.NODE_ENV ?? "development",
});
