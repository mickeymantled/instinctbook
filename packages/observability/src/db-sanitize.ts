import type { PgInstrumentationConfig } from "@opentelemetry/instrumentation-pg";

/**
 * Privacy requirement (docs/BUILD_PROMPT.md non-negotiable rule #6): Postgres spans must never
 * contain query parameter *values* — only the statement text with its `$1`/`$2` placeholders.
 * `enhancedDatabaseReporting` is the pg instrumentation's own flag for attaching parameter
 * values to spans; it must stay off.
 */
export function pgInstrumentationConfig(): PgInstrumentationConfig {
  return { enhancedDatabaseReporting: false };
}

/** Argument shape `@opentelemetry/instrumentation-ioredis`'s `DbStatementSerializer` receives. */
export type RedisCommandArgs = ReadonlyArray<string | Buffer | number | unknown[]>;

/**
 * `dbStatementSerializer` for `@opentelemetry/instrumentation-ioredis`: Redis command arguments
 * can carry values (session tokens, nonce values, rate-limit keys with embedded data), so the
 * `db.statement` span attribute must be the command name only, never the arguments.
 */
export function redisDbStatementSerializer(cmdName: string, _cmdArgs: RedisCommandArgs): string {
  return cmdName;
}
