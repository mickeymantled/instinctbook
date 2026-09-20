import type { FastifyInstance, RouteOptions } from "fastify";
import { $ZodType } from "zod/v4/core";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * The subset of Zod v4's internal `_zod.def` shape this module reads to decide whether an
 * object schema is strict, and to recurse into the schema types the "reject unknown fields on
 * writes" guard needs to see through. Zod does not expose a public "is this object strict, and
 * what does it contain" query, so this reaches into the same `def.type` tag Zod's own
 * `toJSONSchema` processor dispatches on (zod/v4/core/to-json-schema.js). All such access is
 * kept in this one file so a Zod upgrade that changes the internal representation only needs a
 * fix here.
 */
interface ZodDefLike {
  readonly type: string;
  readonly shape?: Record<string, $ZodType>;
  readonly catchall?: $ZodType;
  readonly innerType?: $ZodType;
  readonly element?: $ZodType;
  readonly items?: readonly $ZodType[];
  readonly options?: readonly $ZodType[];
  readonly left?: $ZodType;
  readonly right?: $ZodType;
  readonly valueType?: $ZodType;
  readonly in?: $ZodType;
  readonly out?: $ZodType;
  readonly getter?: () => $ZodType;
}

function defOf(schema: $ZodType): ZodDefLike {
  return (schema as unknown as { _zod: { def: ZodDefLike } })._zod.def;
}

function isStrictCatchall(catchall: $ZodType | undefined): boolean {
  return catchall !== undefined && defOf(catchall).type === "never";
}

/**
 * Walks a Zod schema tree looking for a bare or loose object schema — one whose unrecognized
 * keys are silently stripped (`z.object`) or passed through (`z.looseObject`) instead of
 * rejected (`z.strictObject` / `.strict()`, whose catchall type is `"never"`). Returns a dotted
 * path to each violation found, relative to `path`.
 *
 * Recurses through the wrapper/container shapes a write body realistically contains: nested
 * objects, arrays, tuples, unions (including discriminated unions — they share Zod's `"union"`
 * def type), optional/nullable/default/prefault/catch/readonly/nonoptional wrappers,
 * intersections, records/maps/sets, pipes, and lazy schemas (cycle-guarded via `seen`).
 */
export function findNonStrictObjectSchemas(
  schema: $ZodType,
  path: string,
  seen: Set<$ZodType> = new Set(),
): string[] {
  if (seen.has(schema)) {
    return [];
  }
  seen.add(schema);

  const def = defOf(schema);

  switch (def.type) {
    case "object": {
      const violations = isStrictCatchall(def.catchall) ? [] : [path];
      const nested = Object.entries(def.shape ?? {}).flatMap(([key, value]) =>
        findNonStrictObjectSchemas(value, `${path}.${key}`, seen),
      );
      return [...violations, ...nested];
    }
    case "array":
      return def.element ? findNonStrictObjectSchemas(def.element, `${path}[]`, seen) : [];
    case "tuple":
      return (def.items ?? []).flatMap((item, index) =>
        findNonStrictObjectSchemas(item, `${path}[${index}]`, seen),
      );
    case "union":
      return (def.options ?? []).flatMap((option, index) =>
        findNonStrictObjectSchemas(option, `${path}|${index}`, seen),
      );
    case "intersection": {
      const left = def.left ? findNonStrictObjectSchemas(def.left, `${path}&left`, seen) : [];
      const right = def.right ? findNonStrictObjectSchemas(def.right, `${path}&right`, seen) : [];
      return [...left, ...right];
    }
    case "record":
    case "map":
    case "set":
      return def.valueType ? findNonStrictObjectSchemas(def.valueType, `${path}{}`, seen) : [];
    case "pipe": {
      const input = def.in ? findNonStrictObjectSchemas(def.in, `${path}(in)`, seen) : [];
      const output = def.out ? findNonStrictObjectSchemas(def.out, `${path}(out)`, seen) : [];
      return [...input, ...output];
    }
    case "lazy":
      return def.getter ? findNonStrictObjectSchemas(def.getter(), path, seen) : [];
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
    case "nonoptional":
      return def.innerType ? findNonStrictObjectSchemas(def.innerType, path, seen) : [];
    default:
      return [];
  }
}

function isZodType(value: unknown): value is $ZodType {
  return value instanceof $ZodType;
}

function routeMethods(routeOptions: RouteOptions): readonly string[] {
  return Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
}

/**
 * Rejects any registered write route (POST/PUT/PATCH/DELETE) whose Zod `body` schema is a bare
 * or loose object anywhere in its tree, in favor of `z.strictObject(...)`/`.strict()`. Wired
 * into every `buildApp()` instance (see app.ts) so it is impossible to ship a write route that
 * silently accepts unknown fields — docs/SPEC.md "Reliability contract": "Unknown fields are
 * rejected on writes."
 *
 * Runs as each route registers, via Fastify's `onRoute` hook, which fires synchronously at
 * `app.<method>(...)` call time — not deferred to `app.ready()`. A violation therefore throws at
 * build/startup time, before the app ever serves a request, and the thrown message names the
 * offending route and path so the fix is immediate.
 *
 * Routes with no `body` schema are fine (nothing to reject unknown fields on).
 */
export function assertStrictWriteSchemas(app: FastifyInstance): void {
  app.addHook("onRoute", (routeOptions: RouteOptions) => {
    const methods = routeMethods(routeOptions);
    if (!methods.some((method) => WRITE_METHODS.has(method))) {
      return;
    }

    const body = (routeOptions.schema as { body?: unknown } | undefined)?.body;
    if (body === undefined || !isZodType(body)) {
      return;
    }

    const violations = findNonStrictObjectSchemas(body, "body");
    if (violations.length > 0) {
      throw new Error(
        `Route ${methods.join(",")} ${routeOptions.url}: body schema is not strict at ` +
          `${violations.join(", ")}. Every write body (including nested objects) must use ` +
          "z.strictObject(...) or .strict() so unrecognized fields are rejected, not silently " +
          "dropped or passed through.",
      );
    }
  });
}
