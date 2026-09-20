import type { ConnectionOptions, Job, JobsOptions } from "bullmq";
import { Queue } from "bullmq";
import type { z } from "zod";
import { SYSTEM_NOOP_JOB_NAME, SystemNoopPayloadSchema } from "./jobs/system.js";

/** Start small: one queue. Later slices add more names here as they introduce new job types. */
export const QUEUE_NAMES = ["system"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * Single source of truth for "which job names exist on which queue, and what does their payload
 * look like". Job payload types (see {@link JobPayload}) are derived from this, so a queue's
 * type-level job registry and its runtime Zod validation can never drift apart.
 */
const JOB_SCHEMAS = {
  system: {
    [SYSTEM_NOOP_JOB_NAME]: SystemNoopPayloadSchema,
  },
} as const satisfies Record<QueueName, Record<string, z.ZodTypeAny>>;

type JobSchemasByQueue = typeof JOB_SCHEMAS;
export type JobName<Q extends QueueName> = keyof JobSchemasByQueue[Q] & string;
export type JobPayload<Q extends QueueName, J extends JobName<Q>> = z.infer<
  JobSchemasByQueue[Q][J]
>;

const ONE_HOUR_SECONDS = 3600;
const SEVEN_DAYS_SECONDS = 7 * 24 * 3600;

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { age: ONE_HOUR_SECONDS, count: 1000 },
  removeOnFail: { age: SEVEN_DAYS_SECONDS },
};

/** Creates a BullMQ Queue with ibook's default job options. `connection` must be a "bullmq"-role
 * connection from {@link createRedis} (`maxRetriesPerRequest: null`). */
export function createQueue(name: QueueName, connection: ConnectionOptions): Queue {
  return new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}

/**
 * Looks up the Zod schema registered for `jobName` on `queueName`, or `undefined` if no such
 * job is registered. Used by the enqueue-side validation below, and reused by worker processors
 * (apps/worker) to re-validate a job's payload on receipt — queue contents are untrusted input
 * too, since anything with Redis access could have enqueued a malformed job directly.
 */
export function getJobSchema<Q extends QueueName>(
  queueName: Q,
  jobName: string,
): z.ZodTypeAny | undefined {
  const schemasForQueue: Record<string, z.ZodTypeAny> = JOB_SCHEMAS[queueName];
  return schemasForQueue[jobName];
}

/**
 * Validates `payload` against the job's registered Zod schema and adds it to `queue`. Throws
 * (without touching the queue) if the job name is not registered for `queueName`, or if the
 * payload fails validation — callers never get an invalid job onto the queue.
 */
export async function enqueue<Q extends QueueName, J extends JobName<Q>>(
  queue: Queue,
  queueName: Q,
  jobName: J,
  payload: JobPayload<Q, J>,
  options?: JobsOptions,
): Promise<Job<JobPayload<Q, J>>> {
  const schema = getJobSchema(queueName, jobName);

  if (schema === undefined) {
    throw new Error(`Unknown job "${jobName}" for queue "${queueName}".`);
  }

  const validated = schema.parse(payload) as JobPayload<Q, J>;
  return (await queue.add(jobName, validated, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
  })) as Job<JobPayload<Q, J>>;
}
