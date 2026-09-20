import { Redis } from "ioredis";

export type RedisRole = "bullmq" | "app";

export interface CreateRedisOptions {
  /**
   * "bullmq": a connection handed to a BullMQ Queue/Worker/QueueEvents. BullMQ requires
   * `maxRetriesPerRequest: null` on these connections (it does its own retry/backoff handling
   * internally); setting anything else makes BullMQ throw at construction time.
   *
   * "app": a connection used directly by application code (e.g. the nonce store, D-008). These
   * get a finite retry budget and `enableOfflineQueue: false` so a command issued while Redis is
   * unreachable fails fast instead of queuing silently — callers fail closed rather than hanging.
   */
  readonly role: RedisRole;
}

const APP_MAX_RETRIES_PER_REQUEST = 3;

export function createRedis(url: string, opts: CreateRedisOptions): Redis {
  // Intentionally not annotated as `RedisOptions` — the widened named-interface type defeats
  // overload resolution on `new Redis(url, options)` below (TS picks the wrong constructor
  // overload and reports a confusing "string is not assignable to number"); leaving this
  // inferred as a literal type lets TS pick the `(path: string, options) => Redis` overload.
  const options =
    opts.role === "bullmq"
      ? { maxRetriesPerRequest: null }
      : { maxRetriesPerRequest: APP_MAX_RETRIES_PER_REQUEST, enableOfflineQueue: false };

  return new Redis(url, options);
}

/** Readiness check: succeeds only if the connection can round-trip a PING. */
export async function pingRedis(redis: Redis): Promise<void> {
  await redis.ping();
}
