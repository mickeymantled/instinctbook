import { describe, expect, it } from "vitest";
import { createRedis, pingRedis } from "./redis.js";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";

describe("createRedis", () => {
  it("pings successfully for both the bullmq and app roles", async () => {
    const bullmqConnection = createRedis(TEST_REDIS_URL, { role: "bullmq" });
    const appConnection = createRedis(TEST_REDIS_URL, { role: "app" });

    try {
      await expect(pingRedis(bullmqConnection)).resolves.toBeUndefined();
      await expect(pingRedis(appConnection)).resolves.toBeUndefined();
    } finally {
      await bullmqConnection.quit();
      await appConnection.quit();
    }
  });

  it("app-role connections fail fast (enableOfflineQueue: false) instead of queuing commands", async () => {
    // An address nothing is listening on: the command must reject immediately rather than sit
    // in an offline queue waiting for a connection that will never come.
    const connection = createRedis("redis://127.0.0.1:1", { role: "app" });
    try {
      await expect(pingRedis(connection)).rejects.toThrow();
    } finally {
      connection.disconnect();
    }
  });
});
