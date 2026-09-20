import type { QueueName } from "@ibook/queue";
import { getJobSchema } from "@ibook/queue";
import type { ConnectionOptions, Job } from "bullmq";
import { Worker } from "bullmq";
import type { Logger } from "pino";

/**
 * Handles one job's already-validated payload. Must not throw for expected outcomes — throw
 * only to fail the job (BullMQ retries per the queue's default job options).
 */
export type JobProcessor<T = unknown> = (payload: T, job: Job) => Promise<void>;

/** Job name -> processor. A job name with no entry here fails the job (see startWorker below). */
export type ProcessorMap = Record<string, JobProcessor>;

export interface StartWorkerDeps {
  /** A "bullmq"-role connection from `createRedis` (`maxRetriesPerRequest: null`). */
  readonly connection: ConnectionOptions;
  readonly concurrency: number;
  readonly logger: Logger;
  readonly processors: ProcessorMap;
  /** Defaults to "system" — the only queue slice 1.3 wires up. */
  readonly queueName?: QueueName;
  /**
   * BullMQ key prefix override. Production never sets this (BullMQ's own default). Tests set a
   * random prefix per run so they don't collide over a shared Redis instance.
   */
  readonly prefix?: string | undefined;
}

export interface RunningWorker {
  readonly worker: Worker;
  isRunning(): boolean;
  close(): Promise<void>;
}

const DEFAULT_QUEUE_NAME: QueueName = "system";

/**
 * Starts a BullMQ Worker for `deps.queueName` (default "system") that dispatches each job to
 * `deps.processors[job.name]`. Every job's payload is re-validated against its registered Zod
 * schema on receipt, regardless of whether it passed validation at enqueue time — queue
 * contents are untrusted input too (anything with Redis access could enqueue a job directly). A
 * job whose name has no registered schema, or no registered processor, fails without running
 * any processor.
 *
 * Logs job id, name, attempt number, duration, and outcome only — never the job payload.
 */
export function startWorker(deps: StartWorkerDeps): RunningWorker {
  const queueName = deps.queueName ?? DEFAULT_QUEUE_NAME;
  const startedAtByJobId = new Map<string, number>();

  const worker = new Worker(
    queueName,
    async (job: Job): Promise<void> => {
      const schema = getJobSchema(queueName, job.name);
      if (schema === undefined) {
        throw new Error(`Unknown job name "${job.name}" on queue "${queueName}".`);
      }

      const processor = deps.processors[job.name];
      if (processor === undefined) {
        throw new Error(`No processor registered for job "${job.name}" on queue "${queueName}".`);
      }

      const payload = schema.parse(job.data);
      await processor(payload, job);
    },
    {
      connection: deps.connection,
      concurrency: deps.concurrency,
      ...(deps.prefix !== undefined ? { prefix: deps.prefix } : {}),
    },
  );

  worker.on("active", (job) => {
    if (job.id !== undefined) {
      startedAtByJobId.set(job.id, Date.now());
    }
  });

  worker.on("completed", (job) => {
    const startedAt = job.id !== undefined ? startedAtByJobId.get(job.id) : undefined;
    if (job.id !== undefined) {
      startedAtByJobId.delete(job.id);
    }
    deps.logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        attempt: job.attemptsMade,
        durationMs: startedAt !== undefined ? Date.now() - startedAt : undefined,
        outcome: "completed",
      },
      "job completed",
    );
  });

  worker.on("failed", (job, error) => {
    const startedAt = job?.id !== undefined ? startedAtByJobId.get(job.id) : undefined;
    if (job?.id !== undefined) {
      startedAtByJobId.delete(job.id);
    }
    deps.logger.error(
      {
        jobId: job?.id,
        jobName: job?.name,
        attempt: job?.attemptsMade,
        durationMs: startedAt !== undefined ? Date.now() - startedAt : undefined,
        outcome: "failed",
        errorName: error.name,
        errorMessage: error.message,
      },
      "job failed",
    );
  });

  return {
    worker,
    isRunning() {
      return worker.isRunning();
    },
    async close() {
      await worker.close();
    },
  };
}
