import Fastify from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { registerErrorHandling } from "../errors.js";
import { assertStrictWriteSchemas } from "./strict-write-schemas.js";

function buildBareApp() {
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);
  assertStrictWriteSchemas(app);
  return app;
}

describe("assertStrictWriteSchemas", () => {
  it("allows a write route whose body is a strict object", () => {
    const app = buildBareApp();
    expect(() =>
      app.post("/things", { schema: { body: z.strictObject({ name: z.string() }) } }, async () => ({
        ok: true,
      })),
    ).not.toThrow();
  });

  it("allows a write route with no body schema at all", () => {
    const app = buildBareApp();
    expect(() => app.post("/things", async () => ({ ok: true }))).not.toThrow();
  });

  it("ignores non-write methods entirely, even with a non-strict body-shaped schema", () => {
    const app = buildBareApp();
    expect(() =>
      app.get(
        "/things",
        { schema: { querystring: z.object({ q: z.string().optional() }) } },
        async () => ({ ok: true }),
      ),
    ).not.toThrow();
  });

  it("throws at route registration for a bare (non-strict) object body, naming the route", () => {
    const app = buildBareApp();
    expect(() =>
      app.post("/things", { schema: { body: z.object({ name: z.string() }) } }, async () => ({
        ok: true,
      })),
    ).toThrow(/POST.*\/things.*body/);
  });

  it("throws for a loose object body", () => {
    const app = buildBareApp();
    expect(() =>
      app.post("/things", { schema: { body: z.looseObject({ name: z.string() }) } }, async () => ({
        ok: true,
      })),
    ).toThrow();
  });

  it("throws for a non-strict object nested inside an otherwise-strict body", () => {
    const app = buildBareApp();
    expect(() =>
      app.post(
        "/things",
        { schema: { body: z.strictObject({ meta: z.object({ note: z.string() }) }) } },
        async () => ({ ok: true }),
      ),
    ).toThrow(/body\.meta/);
  });

  it("throws for a non-strict object nested inside an array element", () => {
    const app = buildBareApp();
    expect(() =>
      app.post(
        "/things",
        {
          schema: {
            body: z.strictObject({ items: z.array(z.object({ id: z.string() })) }),
          },
        },
        async () => ({ ok: true }),
      ),
    ).toThrow(/body\.items\[\]/);
  });

  it("throws for a non-strict object hidden behind optional/nullable wrappers", () => {
    const app = buildBareApp();
    expect(() =>
      app.post(
        "/things",
        {
          schema: {
            body: z.strictObject({
              meta: z.object({ note: z.string() }).optional().nullable(),
            }),
          },
        },
        async () => ({ ok: true }),
      ),
    ).toThrow(/body\.meta/);
  });

  it("throws for a non-strict object hidden inside one branch of a union", () => {
    const app = buildBareApp();
    expect(() =>
      app.post(
        "/things",
        {
          schema: {
            body: z.union([
              z.strictObject({ kind: z.literal("a") }),
              z.object({ kind: z.literal("b") }),
            ]),
          },
        },
        async () => ({ ok: true }),
      ),
    ).toThrow(/body\|1/);
  });

  it("does not infinite-loop on a recursive (lazy) schema", () => {
    const app = buildBareApp();
    interface Recursive {
      readonly name: string;
      readonly child?: Recursive | undefined;
    }
    const recursiveSchema: z.ZodType<Recursive> = z.lazy(() =>
      z.strictObject({ name: z.string(), child: recursiveSchema.optional() }),
    );

    expect(() =>
      app.post(
        "/things",
        { schema: { body: z.strictObject({ root: recursiveSchema }) } },
        async () => ({ ok: true }),
      ),
    ).not.toThrow();
  });
});
