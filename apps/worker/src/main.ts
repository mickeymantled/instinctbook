// biome-ignore-start assist/source/organizeImports: the instrumentation.js import below MUST
// stay textually first — ESM static imports evaluate depth-first in source order, and
// OpenTelemetry (when enabled) has to be initialised before any module that uses http/pg/ioredis
// is imported. Reordering this alphabetically (as the organizeImports assist would) silently
// breaks that guarantee. See src/instrumentation.ts and ../otel-register.mjs (the latter loaded
// via `node --import`, required for core-module instrumentation under ESM — plain import order
// alone is not sufficient for that part).
import { shutdownTelemetry } from "./instrumentation.js";

import { createDb, pingDb } from "@ibook/db";
import { createLoggerOptions } from "@ibook/observability";
import { createRedis, pingRedis, SYSTEM_NOOP_JOB_NAME } from "@ibook/queue";
import pino from "pino";
import { loadConfig } from "./config.js";
import { startHealthServer } from "./health.js";
import type { ProcessorMap } from "./worker.js";
import { startWorker } from "./worker.js";
// biome-ignore-end assist/source/organizeImports: see biome-ignore-start above

const FORCE_EXIT_TIMEOUT_MS = 10_000;

function toErrorFields(error: unknown): { errorName: string; errorMessage: string } {
  const cause = error instanceof Error ? error : new Error(String(error));
  return { errorName: cause.name, errorMessage: cause.message };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = pino(
    createLoggerOptions({
      service: config.SERVICE_NAME,
      env: config.NODE_ENV,
      level: config.LOG_LEVEL,
    }),
  );

  // No migrations here: migrations are an explicit `pnpm db:migrate` step (apps/api/src/server.ts
  // makes the same choice), never run implicitly on service boot.
  const { pool, close: closeDb } = createDb(config.DATABASE_URL);
  const bullmqConnection = createRedis(config.REDIS_URL, { role: "bullmq" });
  const appRedis = createRedis(config.REDIS_URL, { role: "app" });

  const processors: ProcessorMap = {
    // A real liveness/self-test job: successfully completing it proves the worker's queue
    // plumbing (Redis connection, job dispatch, payload validation) works end to end.
    [SYSTEM_NOOP_JOB_NAME]: async () => {},
  };

  const runningWorker = startWorker({
    connection: bullmqConnection,
    concurrency: config.WORKER_CONCURRENCY,
    logger,
    processors,
  });

  const health = startHealthServer({
    port: config.WORKER_HEALTH_PORT,
    readinessChecks: {
      postgres: () => pingDb(pool),
      redis: () => pingRedis(appRedis),
      worker: async () => {
        if (!runningWorker.isRunning()) {
          throw new Error("worker is not running");
        }
      },
    },
  });

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info({ signal }, "shutting down");

    const forceExitTimer = setTimeout(() => {
      logger.error({ signal }, "graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, FORCE_EXIT_TIMEOUT_MS);
    forceExitTimer.unref();

    (async () => {
      await health.close();
      await runningWorker.close();
      await appRedis.quit();
      await bullmqConnection.quit();
      await closeDb();
      await shutdownTelemetry();
    })()
      .then(() => {
        clearTimeout(forceExitTimer);
        process.exit(0);
      })
      .catch((error: unknown) => {
        clearTimeout(forceExitTimer);
        logger.error(toErrorFields(error), "error during shutdown");
        process.exit(1);
      });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  logger.info({ healthPort: config.WORKER_HEALTH_PORT }, "worker started");
}

void main().catch((error: unknown) => {
  console.error("worker failed to start", toErrorFields(error));
  process.exitCode = 1;
});
