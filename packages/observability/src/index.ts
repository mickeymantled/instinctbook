export const PACKAGE_NAME = "@ibook/observability" as const;

export type { RedisCommandArgs } from "./db-sanitize.js";
export { pgInstrumentationConfig, redisDbStatementSerializer } from "./db-sanitize.js";
export type { FastifyOtelInstrumentationOpts } from "./fastify-otel.js";
export {
  createFastifyOtelInstrumentation,
  FastifyOtelInstrumentation,
} from "./fastify-otel.js";
export {
  sanitizeHttpRequestSpan,
  sanitizeIncomingSpanAttributes,
  sanitizeOutgoingSpanAttributes,
} from "./http-sanitize.js";
export type { CreateLoggerOptionsInput } from "./logger.js";
export { createLoggerOptions } from "./logger.js";
export { REDACT_PATHS, REDACTED_CENSOR, SENSITIVE_LOG_KEYS } from "./redaction.js";
export type { InitTelemetryInput, ShutdownTelemetry } from "./telemetry.js";
export { buildCoreInstrumentations, initTelemetry } from "./telemetry.js";

export const IBOOK_CORRELATION_ID_ATTRIBUTE = "ibook.correlation_id" as const;
