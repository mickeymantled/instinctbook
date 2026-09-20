import { ProblemSchema } from "@ibook/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "./errors.js";
import type { TestApp } from "./test-helpers.js";
import { buildTestApp } from "./test-helpers.js";

describe("problem+json error handling", () => {
  let testApp: TestApp;

  beforeEach(() => {
    testApp = buildTestApp();

    testApp.app.get("/test/throws-app-error", async () => {
      throw AppError.forbidden("Nope.");
    });

    testApp.app.get("/test/throws-generic-error", async () => {
      throw new Error("super secret internal detail: db password is hunter2");
    });

    testApp.app.get("/test/throws-retryable", async () => {
      throw AppError.rateLimited(30, "Slow down.");
    });

    testApp.app.post(
      "/test/validated",
      { schema: { body: z.object({ secret: z.string().min(5) }) } },
      async (request) => ({ ok: true, len: request.body.secret.length }),
    );
  });

  it("returns a problem+json 404 for an unknown route", async () => {
    const response = await testApp.app.inject({ method: "GET", url: "/does-not-exist" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/problem+json");

    const body = ProblemSchema.parse(response.json());
    expect(body.code).toBe("not_found");
    expect(body.status).toBe(404);
    expect(body.correlation_id).toBe(response.headers["x-correlation-id"]);
  });

  it("propagates a thrown AppError as its own problem", async () => {
    const response = await testApp.app.inject({ method: "GET", url: "/test/throws-app-error" });

    expect(response.statusCode).toBe(403);
    const body = ProblemSchema.parse(response.json());
    expect(body.code).toBe("forbidden");
    expect(body.detail).toBe("Nope.");
    expect(body.retryable).toBe(false);
  });

  it("turns a thrown generic Error into a generic 500 with no internal leakage", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/test/throws-generic-error",
    });

    expect(response.statusCode).toBe(500);
    const body = ProblemSchema.parse(response.json());
    expect(body.code).toBe("internal_error");
    expect(response.body).not.toContain("hunter2");
    expect(response.body).not.toContain("secret internal detail");
    expect(body.detail).toBe("An unexpected error occurred.");
  });

  it("sets Retry-After when retryAfterSeconds is set", async () => {
    const response = await testApp.app.inject({ method: "GET", url: "/test/throws-retryable" });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("30");
    const body = ProblemSchema.parse(response.json());
    expect(body.retryable).toBe(true);
    expect(body.retry_after_seconds).toBe(30);
  });

  it("maps a schema validation failure to 400 with errors[] and never echoes the bad value", async () => {
    const response = await testApp.app.inject({
      method: "POST",
      url: "/test/validated",
      payload: { secret: "hi" },
    });

    expect(response.statusCode).toBe(400);
    const body = ProblemSchema.parse(response.json());
    expect(body.code).toBe("validation_failed");
    expect(body.errors).toBeDefined();
    expect(body.errors?.length).toBeGreaterThan(0);
    expect(response.body).not.toContain('"hi"');
  });
});

describe("correlation ids", () => {
  it("generates one when absent from the request", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: "GET", url: "/healthz" });

    const id = response.headers["x-correlation-id"];
    expect(typeof id).toBe("string");
    expect(id as string).toMatch(/^cor_[0-9A-Za-z]+$/);
  });

  it("echoes back a well-formed inbound X-Correlation-Id", async () => {
    const { app } = buildTestApp();
    const inbound = "abcd1234-EFGH5678_ok";
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-correlation-id": inbound },
    });

    expect(response.headers["x-correlation-id"]).toBe(inbound);
  });

  it("replaces a malformed/oversized inbound X-Correlation-Id with a generated one", async () => {
    const { app } = buildTestApp();
    const malicious = `${"x".repeat(200)} ${"\n"} drop table agents;`;
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-correlation-id": malicious },
    });

    const id = response.headers["x-correlation-id"];
    expect(id).not.toBe(malicious);
    expect(id as string).toMatch(/^cor_[0-9A-Za-z]+$/);
  });
});

describe("security headers", () => {
  it("are present on every response", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("are present on error responses too", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
