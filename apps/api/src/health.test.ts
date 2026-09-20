import Fastify from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { describe, expect, it } from "vitest";
import { registerErrorHandling } from "./errors.js";
import { registerHealthRoutes } from "./health.js";
import { buildTestApp } from "./test-helpers.js";

function buildBareApp(
  timeoutMs?: number,
  readinessChecks: Record<string, () => Promise<void>> = {},
) {
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);
  registerHealthRoutes(app, readinessChecks, timeoutMs);
  return app;
}

describe("GET /healthz", () => {
  it("returns 200 ok with no dependency checks", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("GET /readyz", () => {
  it("returns 200 ready when there are no checks", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready", checks: {} });
  });

  it("returns 200 ready when every check passes", async () => {
    const { app } = buildTestApp({
      readinessChecks: {
        db: async () => {},
        redis: async () => {},
      },
    });

    const response = await app.inject({ method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready", checks: { db: "ok", redis: "ok" } });
  });

  it("returns a 503 problem when a check throws, without leaking the error message", async () => {
    const secretConnectionString = "postgres://user:hunter2@internal-db:5432/prod";
    const { app } = buildTestApp({
      readinessChecks: {
        db: async () => {
          throw new Error(secretConnectionString);
        },
      },
    });

    const response = await app.inject({ method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(503);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.body).not.toContain(secretConnectionString);
    expect(response.body).not.toContain("hunter2");

    const body = response.json();
    expect(body.code).toBe("service_unavailable");
    expect(body.retryable).toBe(true);
    expect(body.errors).toEqual(expect.arrayContaining([{ path: "db", message: "failed" }]));
  });

  it("returns a 503 problem when a check hangs past its timeout", async () => {
    const app = buildBareApp(20, {
      slow: () => new Promise(() => {}), // never resolves
    });

    const response = await app.inject({ method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.code).toBe("service_unavailable");
    expect(body.errors).toEqual(expect.arrayContaining([{ path: "slow", message: "failed" }]));
  });
});
