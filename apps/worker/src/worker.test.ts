import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import type { Redis } from "@ibook/queue";
import { createRedis, DEFAULT_JOB_OPTIONS, enqueue, SYSTEM_NOOP_JOB_NAME } from "@ibook/queue";
import { Queue, QueueEvents } from "bullmq";
import type { Logger } from "pino";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessorMap, RunningWorker } from "./worker.js";
import { startWorker } from "./worker.js";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";

interface CapturedLogger {
  readonly logger: Logger;
  text(): string;
}

function captureLogger(): CapturedLogger {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return { logger: pino({ level: "info" }, stream), text: () => chunks.join("") };
}

describe("startWorker", () => {
  let connection: Redis;
  let queue: Queue;
  let queueEvents: QueueEvents;
  // A fresh, random BullMQ prefix per test isolates this run's Redis keys from every other test
  // (and every other run of this same file) sharing the dev-infra Redis instance.
  let prefix: string;
  let runningWorker: RunningWorker | undefined;

  beforeEach(async () => {
    prefix = `test-worker-${randomUUID()}`;
    connection = createRedis(TEST_REDIS_URL, { role: "bullmq" });
    queue = new Queue("system", { connection, prefix, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queueEvents = new QueueEvents("system", { connection, prefix });
    await queueEvents.waitUntilReady();
  });

  afterEach(async () => {
    if (runningWorker !== undefined) {
      await runningWorker.close();
      runningWorker = undefined;
    }
    await queueEvents.close();
    await queue.close();
    await connection.quit();
  });

  it("processes a system.noop job end to end", async () => {
    let resolveDone: (() => void) | undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    let receivedPayload: unknown;

    const processors: ProcessorMap = {
      [SYSTEM_NOOP_JOB_NAME]: async (payload) => {
        receivedPayload = payload;
        resolveDone?.();
      },
    };

    runningWorker = startWorker({
      connection,
      concurrency: 1,
      logger: pino({ level: "silent" }),
      processors,
      prefix,
    });

    await enqueue(queue, "system", SYSTEM_NOOP_JOB_NAME, { marker: "worker-e2e" });
    await done;

    expect(receivedPayload).toEqual({ marker: "worker-e2e" });
  });

  it("rejects an invalid payload at enqueue time, before it ever reaches the queue", async () => {
    await expect(enqueue(queue, "system", SYSTEM_NOOP_JOB_NAME, { marker: "" })).rejects.toThrow();
  });

  it("fails a job whose name is not registered, without running any processor", async () => {
    const processors: ProcessorMap = {
      [SYSTEM_NOOP_JOB_NAME]: async () => {
        throw new Error("should never run for an unregistered job name");
      },
    };

    runningWorker = startWorker({
      connection,
      concurrency: 1,
      logger: pino({ level: "silent" }),
      processors,
      prefix,
    });

    // Add directly through the raw Queue, bypassing @ibook/queue's enqueue() validation, to
    // prove the WORKER itself rejects an unregistered job name — not just the enqueue-time guard.
    // attempts: 1 overrides the queue's default retry-with-backoff so the test doesn't wait
    // through several exponential-backoff retries just to observe the (deterministic) failure.
    const job = await queue.add("not.a.real.job", { marker: "unknown-job" }, { attempts: 1 });

    await expect(job.waitUntilFinished(queueEvents)).rejects.toThrow(/Unknown job name/);
  });

  it("never logs the job payload, even on success", async () => {
    const captured = captureLogger();
    const secretMarker = `super-secret-marker-${randomUUID()}`;

    const processors: ProcessorMap = {
      [SYSTEM_NOOP_JOB_NAME]: async () => {},
    };

    runningWorker = startWorker({
      connection,
      concurrency: 1,
      logger: captured.logger,
      processors,
      prefix,
    });

    const completed = new Promise<void>((resolve) => {
      runningWorker?.worker.once("completed", () => resolve());
    });

    await enqueue(queue, "system", SYSTEM_NOOP_JOB_NAME, { marker: secretMarker });
    await completed;

    expect(captured.text()).toContain("job completed");
    expect(captured.text()).not.toContain(secretMarker);
  });

  it("never logs the job payload on failure either", async () => {
    const captured = captureLogger();
    const secretMarker = `super-secret-marker-${randomUUID()}`;

    runningWorker = startWorker({
      connection,
      concurrency: 1,
      logger: captured.logger,
      processors: {},
      prefix,
    });

    const failed = new Promise<void>((resolve) => {
      runningWorker?.worker.once("failed", () => resolve());
    });

    await queue.add(SYSTEM_NOOP_JOB_NAME, { marker: secretMarker });
    await failed;

    expect(captured.text()).toContain("job failed");
    expect(captured.text()).not.toContain(secretMarker);
  });
});
