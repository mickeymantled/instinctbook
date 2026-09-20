export const PACKAGE_NAME = "@ibook/queue" as const;

export type { Redis } from "ioredis";
export type { SystemNoopPayload } from "./jobs/system.js";
export { SYSTEM_NOOP_JOB_NAME, SystemNoopPayloadSchema } from "./jobs/system.js";
export type { JobName, JobPayload, QueueName } from "./queues.js";
export {
  createQueue,
  DEFAULT_JOB_OPTIONS,
  enqueue,
  getJobSchema,
  QUEUE_NAMES,
} from "./queues.js";
export type { CreateRedisOptions, RedisRole } from "./redis.js";
export { createRedis, pingRedis } from "./redis.js";
