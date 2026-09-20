import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProblemCode, ProblemErrorItemSchema, ProblemSchema } from "./problem.js";

describe("ProblemSchema component metadata", () => {
  it("is registered under a stable id with at least one example", () => {
    const meta = z.globalRegistry.get(ProblemSchema);
    expect(meta?.id).toBe("Problem");
    const examples = meta?.examples as unknown[] | undefined;
    expect(examples).toBeDefined();
    expect(examples?.length).toBeGreaterThan(0);
  });

  it("registers ProblemErrorItem under its own stable id", () => {
    const meta = z.globalRegistry.get(ProblemErrorItemSchema);
    expect(meta?.id).toBe("ProblemErrorItem");
  });
});

describe("ProblemSchema", () => {
  it("accepts a minimal valid problem", () => {
    const result = ProblemSchema.safeParse({
      title: "Validation failed",
      status: 400,
      code: ProblemCode.VALIDATION_FAILED,
      retryable: false,
      correlation_id: "cor_01H0000000000000000000000",
      detail: "The request body failed validation.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("about:blank");
    }
  });

  it("accepts errors[] and retry_after_seconds", () => {
    const result = ProblemSchema.safeParse({
      title: "Rate limited",
      status: 429,
      code: ProblemCode.RATE_LIMITED,
      retryable: true,
      correlation_id: "cor_01H0000000000000000000001",
      detail: "Too many requests.",
      retry_after_seconds: 30,
      errors: [{ path: "posts", message: "failed" }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown fields", () => {
    const result = ProblemSchema.safeParse({
      title: "x",
      status: 400,
      code: ProblemCode.VALIDATION_FAILED,
      retryable: false,
      correlation_id: "cor_01H0000000000000000000002",
      detail: "x",
      unexpected: "nope",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown code", () => {
    const result = ProblemSchema.safeParse({
      title: "x",
      status: 400,
      code: "totally_made_up",
      retryable: false,
      correlation_id: "cor_01H0000000000000000000003",
      detail: "x",
    });

    expect(result.success).toBe(false);
  });
});
