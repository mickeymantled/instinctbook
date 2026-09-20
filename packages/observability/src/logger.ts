import { trace } from "@opentelemetry/api";
import type { LoggerOptions } from "pino";
import pino from "pino";
import { REDACT_PATHS, REDACTED_CENSOR } from "./redaction.js";

export interface CreateLoggerOptionsInput {
  /** Service name, included on every log line as `service`. */
  readonly service: string;
  /** Runtime environment, included on every log line as `env`. */
  readonly env: string;
  /** pino log level (e.g. "info", "debug"). */
  readonly level: string;
}

interface SerializableRequest {
  readonly method?: string;
  readonly url?: string;
}

interface SerializableResponse {
  readonly statusCode?: number;
}

function pathOnly(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/**
 * Builds pino LoggerOptions shared by every service. Callers pass this to `pino(options)` (or
 * to Fastify's `loggerInstance`). Kept dependency-light and framework-agnostic so both the API
 * and the worker (and anything else that logs) redact the same fields the same way.
 */
export function createLoggerOptions(input: CreateLoggerOptionsInput): LoggerOptions {
  return {
    level: input.level,
    base: { service: input.service, env: input.env },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [...REDACT_PATHS],
      censor: REDACTED_CENSOR,
    },
    // Defense in depth only: nothing in this codebase should hand a raw req/res object to
    // the logger, but if it ever does, only these minimal, safe fields survive.
    serializers: {
      req(request: SerializableRequest) {
        return { method: request.method, url: pathOnly(request.url) };
      },
      res(reply: SerializableResponse) {
        return { statusCode: reply.statusCode };
      },
    },
    // Adds trace_id/span_id to every log line emitted while an OpenTelemetry span is active
    // (slice 1.5 item 2), so logs and traces can be correlated. A no-op (returns {}) whenever
    // telemetry is disabled or no span is active — see packages/observability/src/telemetry.ts.
    mixin() {
      const span = trace.getActiveSpan();
      if (span === undefined) {
        return {};
      }
      const spanContext = span.spanContext();
      return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
    },
  };
}
