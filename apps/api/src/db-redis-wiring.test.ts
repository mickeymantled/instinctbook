import { createDb, pingDb } from "@ibook/db";
import type { Redis } from "@ibook/queue";
import { createRedis, pingRedis } from "@ibook/queue";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { testConfig } from "./test-helpers.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://ibook:ibook_dev_only@127.0.0.1:55432/ibook";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";

const cleanups: Array<() => unknown> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/**
 * With `enableOfflineQueue: false` (D-008: app-role Redis connections fail fast/closed), a
 * command issued before the connection has finished its handshake rejects immediately instead
 * of queuing. Tests must wait for "ready" before pinging — a freshly booted server.ts has the
 * same brief window, but in practice `app.listen()` takes longer than the handshake.
 */
function waitForReady(redis: Redis): Promise<void> {
  if (redis.status === "ready") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    redis.once("ready", () => resolve());
    redis.once("error", reject);
  });
}

describe("db/redis wiring (app.decorate)", () => {
  it("decorates app.db and app.redis when both are provided", () => {
    const { db, close } = createDb(TEST_DATABASE_URL);
    const redis: Redis = createRedis(TEST_REDIS_URL, { role: "app" });
    // disconnect(), not quit(): quit() sends a command over the wire, which races the same
    // "not ready yet" failure mode as pinging too early — irrelevant for a synchronous test.
    cleanups.push(close, () => redis.disconnect());

    const app = buildApp({ config: testConfig(), db, redis });

    expect(app.db).toBe(db);
    expect(app.redis).toBe(redis);
  });

  it("leaves app.db and app.redis undefined when neither is provided", () => {
    const app = buildApp({ config: testConfig() });

    expect(app.db).toBeUndefined();
    expect(app.redis).toBeUndefined();
  });
});

describe("GET /readyz against real dev infra", () => {
  it("reports postgres and redis ok", async () => {
    const { pool, close } = createDb(TEST_DATABASE_URL);
    const redis = createRedis(TEST_REDIS_URL, { role: "app" });
    cleanups.push(close, () => redis.disconnect());
    await waitForReady(redis);

    const app = buildApp({
      config: testConfig(),
      readinessChecks: {
        postgres: () => pingDb(pool),
        redis: () => pingRedis(redis),
      },
    });

    const response = await app.inject({ method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready", checks: { postgres: "ok", redis: "ok" } });
  });

  it("reports postgres failed (without leaking the connection string) when it is unreachable", async () => {
    const { pool, close } = createDb("postgres://ibook:wrong@127.0.0.1:1/ibook", { max: 1 });
    const redis = createRedis(TEST_REDIS_URL, { role: "app" });
    cleanups.push(close, () => redis.disconnect());
    await waitForReady(redis);

    const app = buildApp({
      config: testConfig(),
      readinessChecks: {
        postgres: () => pingDb(pool),
        redis: () => pingRedis(redis),
      },
    });

    const response = await app.inject({ method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("wrong");
    expect(response.json()).toEqual({
      status: 503,
      code: "service_unavailable",
      correlation_id: response.headers["x-correlation-id"],
      detail: "One or more readiness checks failed.",
      errors: expect.arrayContaining([{ path: "postgres", message: "failed" }]),
      retryable: true,
      title: "service_unavailable",
      type: "about:blank",
    });
  });
});
