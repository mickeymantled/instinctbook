import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYSTEM_NOOP_JOB_NAME } from "./jobs/system.js";
import { createQueue, enqueue, getJobSchema, QUEUE_NAMES } from "./queues.js";
import { createRedis } from "./redis.js";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";

describe("queues", () => {
  let connection: Redis;

  beforeAll(() => {
    connection = createRedis(TEST_REDIS_URL, { role: "bullmq" });
  });

  afterAll(async () => {
    await connection.quit();
  });

  it("QUEUE_NAMES includes system", () => {
    expect(QUEUE_NAMES).toContain("system");
  });

  it("getJobSchema resolves a registered job and undefined for an unknown one", () => {
    expect(getJobSchema("system", SYSTEM_NOOP_JOB_NAME)).toBeDefined();
    expect(getJobSchema("system", "not.a.real.job")).toBeUndefined();
  });

  it("validates the payload and adds a job", async () => {
    const queue = createQueue("system", connection);
    try {
      const job = await enqueue(queue, "system", SYSTEM_NOOP_JOB_NAME, {
        marker: "queue-package-test",
      });
      expect(job.id).toBeDefined();
      expect(job.data).toEqual({ marker: "queue-package-test" });
    } finally {
      await queue.close();
    }
  });

  it("rejects an invalid payload without adding a job", async () => {
    const queue = createQueue("system", connection);
    try {
      await expect(
        enqueue(queue, "system", SYSTEM_NOOP_JOB_NAME, { marker: "" }),
      ).rejects.toThrow();
    } finally {
      await queue.close();
    }
  });

  it("rejects an unregistered job name", async () => {
    const queue = createQueue("system", connection);
    try {
      await expect(
        // @ts-expect-error intentionally not a registered job name for the "system" queue
        enqueue(queue, "system", "system.not-real", { marker: "x" }),
      ).rejects.toThrow(/Unknown job/);
    } finally {
      await queue.close();
    }
  });
});
