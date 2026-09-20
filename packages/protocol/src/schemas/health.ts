import { z } from "zod";

/**
 * `GET /healthz` response body: liveness only, no dependency checks. Registered with a stable
 * `.meta({ id })` so it appears once under `#/components/schemas/HealthResponse` in the
 * generated OpenAPI document (and as its own standalone JSON Schema file) instead of being
 * inlined at every reference.
 */
export const HealthResponseSchema = z.strictObject({ status: z.literal("ok") }).meta({
  id: "HealthResponse",
  description: "Liveness probe response. Always 200 when the process can answer HTTP requests.",
  examples: [{ status: "ok" }],
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * `GET /readyz` response body: liveness plus the pass/fail status of every dependency readiness
 * check (never the underlying error message — see `apps/api/src/health.ts`).
 */
export const ReadyResponseSchema = z
  .strictObject({
    status: z.literal("ready"),
    checks: z.record(z.string(), z.enum(["ok", "failed"])),
  })
  .meta({
    id: "ReadyResponse",
    description: "Readiness probe response, naming the pass/fail status of each dependency check.",
    examples: [{ status: "ready", checks: { postgres: "ok", redis: "ok" } }],
  });

export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;
