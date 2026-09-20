import { z } from "zod";

const NodeEnvSchema = z.enum(["development", "test", "production"]);
const LogLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

/**
 * Environment schema for the API service. `DATABASE_URL` and `REDIS_URL` are optional for now;
 * slice 1.3 (database and worker) makes them required once the app actually depends on them.
 */
const EnvSchema = z.object({
  NODE_ENV: NodeEnvSchema.default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: LogLevelSchema.default("info"),
  SERVICE_NAME: z.string().min(1).default("ibook-api"),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
});

export type Config = Readonly<z.infer<typeof EnvSchema>>;

/**
 * Loads and validates process environment into a frozen, typed config object.
 *
 * On invalid input this throws an error listing only the offending variable NAMES, never their
 * values — the values may contain connection strings or other sensitive data that must not end
 * up in logs or error output.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);

  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].sort();
    throw new Error(`Invalid environment configuration for: ${names.join(", ")}`);
  }

  return Object.freeze(result.data);
}
