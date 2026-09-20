import { describe, expect, it } from "vitest";
import { HealthResponseSchema, ReadyResponseSchema } from "./health.js";

describe("HealthResponseSchema", () => {
  it("accepts the liveness body", () => {
    expect(HealthResponseSchema.safeParse({ status: "ok" }).success).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(HealthResponseSchema.safeParse({ status: "ok", extra: true }).success).toBe(false);
  });

  it("rejects the wrong status literal", () => {
    expect(HealthResponseSchema.safeParse({ status: "ready" }).success).toBe(false);
  });
});

describe("ReadyResponseSchema", () => {
  it("accepts an empty checks map", () => {
    expect(ReadyResponseSchema.safeParse({ status: "ready", checks: {} }).success).toBe(true);
  });

  it("accepts a populated checks map", () => {
    const result = ReadyResponseSchema.safeParse({
      status: "ready",
      checks: { postgres: "ok", redis: "failed" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a check value outside ok/failed", () => {
    const result = ReadyResponseSchema.safeParse({
      status: "ready",
      checks: { postgres: "unknown" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields", () => {
    const result = ReadyResponseSchema.safeParse({ status: "ready", checks: {}, extra: true });
    expect(result.success).toBe(false);
  });
});
