import { HealthResponseSchema, ReadyResponseSchema } from "@ibook/protocol";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "./errors.js";
import { problemResponses } from "./openapi/problem-responses.js";

/** Name -> async check. A check should reject/throw to report unhealthy. */
export type ReadinessChecks = Record<string, () => Promise<void>>;

const DEFAULT_READINESS_TIMEOUT_MS = 2000;

type CheckStatus = "ok" | "failed";

async function runCheck(
  name: string,
  check: () => Promise<void>,
  timeoutMs: number,
): Promise<[string, CheckStatus]> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`readiness check "${name}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref();
  });

  try {
    await Promise.race([check(), timeout]);
    return [name, "ok"];
  } catch {
    return [name, "failed"];
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Registers `/healthz` (liveness, no dependency checks) and `/readyz` (readiness: runs every
 * injected check in parallel with a per-check timeout). Both are unversioned, public, and take
 * no auth. `/readyz` never leaks check error messages or connection strings — only the check
 * name and "ok"/"failed".
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  readinessChecks: ReadinessChecks,
  timeoutMs: number = DEFAULT_READINESS_TIMEOUT_MS,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/healthz",
    {
      schema: {
        operationId: "getHealthz",
        summary: "Liveness probe.",
        tags: ["system"],
        response: { 200: HealthResponseSchema },
      },
    },
    async () => ({ status: "ok" as const }),
  );

  typedApp.get(
    "/readyz",
    {
      schema: {
        operationId: "getReadyz",
        summary: "Readiness probe: reports the pass/fail status of every dependency check.",
        tags: ["system"],
        response: { 200: ReadyResponseSchema, ...problemResponses(503) },
      },
    },
    async () => {
      const entries = Object.entries(readinessChecks);
      const results = await Promise.all(
        entries.map(([name, check]) => runCheck(name, check, timeoutMs)),
      );
      const failed = results.filter(([, status]) => status === "failed");

      if (failed.length > 0) {
        throw AppError.serviceUnavailable(
          "One or more readiness checks failed.",
          results.map(([name, status]) => ({ path: name, message: status })),
        );
      }

      const checks = Object.fromEntries(results) as Record<string, CheckStatus>;
      return { status: "ready" as const, checks };
    },
  );
}
