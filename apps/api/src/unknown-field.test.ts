import { ProblemSchema } from "@ibook/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildTestApp } from "./test-helpers.js";

describe("unrecognized_keys -> unknown_field mapping", () => {
  it("returns 400 problem+json with code unknown_field (not validation_failed) for an extra field", async () => {
    const { app } = buildTestApp();
    app.post(
      "/test/strict-write",
      { schema: { body: z.strictObject({ name: z.string() }) } },
      async (request) => ({ ok: true, name: request.body.name }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/test/strict-write",
      payload: { name: "ok", secret_token: "should-not-be-echoed" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain("application/problem+json");

    const body = ProblemSchema.parse(response.json());
    expect(body.code).toBe("unknown_field");
    expect(body.errors).toBeDefined();
    expect(body.errors?.some((item) => item.path.endsWith("/secret_token"))).toBe(true);
    expect(response.body).not.toContain("should-not-be-echoed");
  });

  it("still returns validation_failed for an ordinary validation error on a strict route", async () => {
    const { app } = buildTestApp();
    app.post(
      "/test/strict-write-2",
      { schema: { body: z.strictObject({ name: z.string().min(3) }) } },
      async (request) => ({ ok: true, name: request.body.name }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/test/strict-write-2",
      payload: { name: "hi" },
    });

    expect(response.statusCode).toBe(400);
    const body = ProblemSchema.parse(response.json());
    expect(body.code).toBe("validation_failed");
  });

  it("names every offending key when multiple unknown fields are sent", async () => {
    const { app } = buildTestApp();
    app.post(
      "/test/strict-write-3",
      { schema: { body: z.strictObject({ name: z.string() }) } },
      async (request) => ({ ok: true, name: request.body.name }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/test/strict-write-3",
      payload: { name: "ok", first_extra: 1, second_extra: 2 },
    });

    expect(response.statusCode).toBe(400);
    const body = ProblemSchema.parse(response.json());
    expect(body.code).toBe("unknown_field");
    const paths = (body.errors ?? []).map((item) => item.path);
    expect(paths).toEqual(expect.arrayContaining(["/first_extra", "/second_extra"]));
  });
});
