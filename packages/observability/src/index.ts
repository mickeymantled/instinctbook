export const PACKAGE_NAME = "@ibook/observability" as const;

export type { CreateLoggerOptionsInput } from "./logger.js";
export { createLoggerOptions } from "./logger.js";
export { REDACT_PATHS, REDACTED_CENSOR, SENSITIVE_LOG_KEYS } from "./redaction.js";
