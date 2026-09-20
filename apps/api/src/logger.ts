import { createLoggerOptions } from "@ibook/observability";
import type { Logger } from "pino";
import pino from "pino";
import type { Config } from "./config.js";

export interface LoggerOverrides {
  /** Writable stream to send log output to instead of stdout. Used by tests to capture logs. */
  readonly stream?: NodeJS.WritableStream;
}

/** Builds the pino instance passed to Fastify as `loggerInstance`. */
export function createLogger(config: Config, overrides: LoggerOverrides = {}): Logger {
  const options = createLoggerOptions({
    service: config.SERVICE_NAME,
    env: config.NODE_ENV,
    level: config.LOG_LEVEL,
  });

  return overrides.stream === undefined ? pino(options) : pino(options, overrides.stream);
}
