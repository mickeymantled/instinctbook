import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { pgInstrumentationConfig, redisDbStatementSerializer } from "./db-sanitize.js";
import {
  sanitizeHttpRequestSpan,
  sanitizeIncomingSpanAttributes,
  sanitizeOutgoingSpanAttributes,
} from "./http-sanitize.js";

export interface InitTelemetryInput {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly env: string;
  /**
   * Extra `Instrumentation`s to enable alongside the always-on http/pg/ioredis set, e.g. the
   * caller's own `@fastify/otel` instance (apps/api registers that instance separately as a
   * Fastify plugin too, so both share the same tracer).
   */
  readonly extraInstrumentations?: readonly Instrumentation[];
}

export type ShutdownTelemetry = () => Promise<void>;

const NOOP_SHUTDOWN: ShutdownTelemetry = async () => {};

/**
 * Builds the http/pg/ioredis instrumentations shared by every service, each configured so spans
 * can never contain request/response bodies, query strings, or SQL/Redis argument values
 * (docs/BUILD_PROMPT.md non-negotiable rule #6). Exported (not just used internally) so tests
 * can assert on the exact instances/config without spinning up a full SDK.
 */
export function buildCoreInstrumentations(): Instrumentation[] {
  return [
    new HttpInstrumentation({
      // No `headersToSpanAttributes` set: headers (Authorization, Cookie, X-Agent-Signature,
      // attestation, ...) are opt-in for this instrumentation and are never captured unless
      // explicitly listed here, so leaving it unset is itself the control.
      startIncomingSpanHook: sanitizeIncomingSpanAttributes,
      startOutgoingSpanHook: sanitizeOutgoingSpanAttributes,
      requestHook: sanitizeHttpRequestSpan,
    }),
    new PgInstrumentation(pgInstrumentationConfig()),
    new IORedisInstrumentation({ dbStatementSerializer: redisDbStatementSerializer }),
  ];
}

/**
 * Initialises OpenTelemetry tracing, enabled only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set
 * (read by `OTLPTraceExporter` itself, following the standard OTel env var). When unset this is
 * a no-op that returns a no-op shutdown function, so services never pay for or depend on a
 * collector that isn't configured.
 *
 * Must be called before any other module that uses http/pg/ioredis is imported — see
 * apps/api/src/instrumentation.ts and apps/worker/src/instrumentation.ts, which import this as
 * the very first statement in their entrypoints.
 */
export function initTelemetry(input: InitTelemetryInput): ShutdownTelemetry {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (endpoint === undefined || endpoint.length === 0) {
    return NOOP_SHUTDOWN;
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: input.serviceName,
      [ATTR_SERVICE_VERSION]: input.serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: input.env,
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [...buildCoreInstrumentations(), ...(input.extraInstrumentations ?? [])],
  });

  sdk.start();

  return () => sdk.shutdown();
}
