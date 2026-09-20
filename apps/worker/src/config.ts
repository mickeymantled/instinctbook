import { z } from "zod";

const NodeEnvSchema = z.enum(["development", "test", "production"]);
const LogLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const DEFAULT_HEALTH_PORT = 3001;
const DEFAULT_CONCURRENCY = 5;

/** Environment schema for the worker service. */
const EnvSchema = z.object({
  NODE_ENV: NodeEnvSchema.default("development"),
  LOG_LEVEL: LogLevelSchema.default("info"),
  SERVICE_NAME: z.string().min(1).default("ibook-worker"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_HEALTH_PORT),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(DEFAULT_CONCURRENCY),
});

export type Config = Readonly<z.infer<typeof EnvSchema>>;

/**
 * Loads and validates process environment into a frozen, typed config object.
 *
 * On invalid input this throws an error listing only the offending variable NAMES, never their
 * values — the values may contain connection strings or other sensitive data that must not end
 * up in logs or error output. Mirrors apps/api/src/config.ts.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);

  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].sort();
    throw new Error(`Invalid environment configuration for: ${names.join(", ")}`);
  }

  return Object.freeze(result.data);
}
