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
 * Substring that marks a credential as dev-only (docs/BUILD_PROMPT.md non-negotiable rule #6 /
 * slice 1.5 item 6): every dev credential in infra/docker/compose.dev.yaml, compose.yaml, and
 * .env.example files must contain it, so this guard is meaningful. Mirrors
 * apps/api/src/config.ts.
 */
const DEV_ONLY_MARKER = "dev_only";

/**
 * Config keys this service reads that can carry credentials. Only keys actually read belong
 * here — "don't invent unused config" (docs/BUILD_PROMPT.md slice 1.5 item 6).
 */
const CREDENTIAL_ENV_KEYS = ["DATABASE_URL", "REDIS_URL"] as const satisfies ReadonlyArray<
  keyof z.infer<typeof EnvSchema>
>;

/**
 * Refuses to start in production with an obviously-dev-only credential — the local demo stack
 * (compose.yaml) intentionally runs with `NODE_ENV=development` even though it uses production
 * Docker images, precisely so this guard stays meaningful there. Names the offending variable,
 * never its value.
 */
function assertNoDevOnlyCredentialsInProduction(config: Config): void {
  if (config.NODE_ENV !== "production") {
    return;
  }
  for (const key of CREDENTIAL_ENV_KEYS) {
    if (config[key].includes(DEV_ONLY_MARKER)) {
      throw new Error(
        `Refusing to start with NODE_ENV=production: ${key} looks like a dev-only credential ` +
          `(contains "${DEV_ONLY_MARKER}").`,
      );
    }
  }
}

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

  const config = Object.freeze(result.data);
  assertNoDevOnlyCredentialsInProduction(config);
  return config;
}
