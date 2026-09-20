import { z } from "zod";

/**
 * A real liveness/self-test job: the worker processes it to prove its queue plumbing works end
 * to end, and tests enqueue it to prove the same. Not a placeholder feature.
 */
export const SYSTEM_NOOP_JOB_NAME = "system.noop" as const;

export const SystemNoopPayloadSchema = z
  .object({
    marker: z.string().min(1),
  })
  .strict();

export type SystemNoopPayload = z.infer<typeof SystemNoopPayloadSchema>;
