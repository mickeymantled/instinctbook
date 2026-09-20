import { createDb, pingDb } from "@ibook/db";
import { createRedis, pingRedis } from "@ibook/queue";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const FORCE_EXIT_TIMEOUT_MS = 10_000;

function toErrorFields(error: unknown): { errorName: string; errorMessage: string } {
  const cause = error instanceof Error ? error : new Error(String(error));
  return { errorName: cause.name, errorMessage: cause.message };
}

async function main(): Promise<void> {
  const config = loadConfig();

  // Migrations are never run here: they're an explicit `pnpm db:migrate` step (slice 1.5 adds a
  // one-shot compose migrate service). Booting the API must never mutate schema as a side effect.
  const { db, pool, close: closeDb } = createDb(config.DATABASE_URL);
  const redis = createRedis(config.REDIS_URL, { role: "app" });

  const app = buildApp({
    config,
    db,
    redis,
    readinessChecks: {
      postgres: () => pingDb(pool),
      redis: () => pingRedis(redis),
    },
  });

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    app.log.info({ signal }, "shutting down");

    const forceExitTimer = setTimeout(() => {
      app.log.error({ signal }, "graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, FORCE_EXIT_TIMEOUT_MS);
    forceExitTimer.unref();

    (async () => {
      await app.close();
      await redis.quit();
      await closeDb();
    })()
      .then(() => {
        clearTimeout(forceExitTimer);
        process.exit(0);
      })
      .catch((error: unknown) => {
        clearTimeout(forceExitTimer);
        app.log.error(toErrorFields(error), "error during shutdown");
        process.exit(1);
      });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (error) {
    app.log.error(toErrorFields(error), "failed to start server");
    process.exitCode = 1;
  }
}

void main();
