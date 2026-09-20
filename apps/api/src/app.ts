import type { Database } from "@ibook/db";
import type { Redis } from "@ibook/queue";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import Fastify, { LogController } from "fastify";
import fastifyPlugin from "fastify-plugin";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Config } from "./config.js";
import { CORRELATION_ID_PATTERN, generateCorrelationId } from "./correlation.js";
import { registerErrorHandling } from "./errors.js";
import type { ReadinessChecks } from "./health.js";
import { registerHealthRoutes } from "./health.js";
import type { LoggerOverrides } from "./logger.js";
import { createLogger } from "./logger.js";
import { registerOpenApiDocumentRoute } from "./openapi/document-route.js";
import { registerOpenApiDocument } from "./openapi/register.js";
import { assertStrictWriteSchemas } from "./openapi/strict-write-schemas.js";

const ONE_MEBIBYTE = 1_048_576;
const CORRELATION_ID_LOG_LABEL = "correlationId";
const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * `db`/`redis` are only present when the caller decorates them (production always does, via
 * server.ts — see {@link BuildAppDeps}). They're optional here, not just at the `BuildAppDeps`
 * call site, so a handler that reads `app.db`/`app.redis` is forced to account for the case
 * where slice 1.3's unit tests build an app with neither.
 */
declare module "fastify" {
  interface FastifyInstance {
    readonly db?: Database;
    readonly redis?: Redis;
  }
}

export interface BuildAppDeps {
  readonly config: Config;
  /** Logger construction overrides. Tests pass a stream here to capture log output. */
  readonly logger?: LoggerOverrides;
  /** Dependency health checks run by GET /readyz. Defaults to none. */
  readonly readinessChecks?: ReadinessChecks;
  /**
   * Real dependencies, decorated onto the Fastify instance as `app.db` / `app.redis` for later
   * handlers to use. Optional so `buildApp` stays constructible in unit tests that don't need a
   * real Postgres or Redis connection (most of this package's own tests) — only `server.ts`
   * (the real process entrypoint) is expected to always provide both.
   */
  readonly db?: Database | undefined;
  readonly redis?: Redis | undefined;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Builds a fully configured Fastify instance. Does not call `listen` — that is `server.ts`'s
 * job, so tests can exercise the app entirely in-process via `app.inject(...)`.
 */
export function buildApp(deps: BuildAppDeps) {
  const { config, readinessChecks = {} } = deps;
  const logger = createLogger(config, deps.logger ?? {});

  const serverOptions: FastifyServerOptions = {
    loggerInstance: logger,
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: CORRELATION_ID_LOG_LABEL,
    }),
    bodyLimit: ONE_MEBIBYTE,
    trustProxy: false,
    requestIdHeader: false,
    genReqId(rawRequest) {
      const inbound = firstHeaderValue(rawRequest.headers[CORRELATION_ID_HEADER]);
      if (inbound !== undefined && CORRELATION_ID_PATTERN.test(inbound)) {
        return inbound;
      }
      return generateCorrelationId();
    },
  };

  const app = Fastify(serverOptions).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // A plain `addHook`, not itself a deferred plugin registration, so it takes effect
  // immediately — before any route this function (or a caller, afterwards) declares. No
  // ordering dependency on the block below.
  assertStrictWriteSchemas(app);

  // Registers `@fastify/swagger`, which captures every route's schema via its own `onRoute`
  // hook — wired up inside swagger's plugin body, which (like any `app.register(...)` plugin)
  // Fastify/avvio run later, during the boot sequence, not synchronously here. A route added
  // directly on `app` between this call and that boot would therefore run before the hook
  // exists and be silently missing from the generated document (verified against the real
  // plugin while building this: an unwrapped `app.get()` right after this call produced a
  // document with an empty `paths`).
  registerOpenApiDocument(app);

  // Every route this app declares is therefore wrapped in its own `app.register(...)` too, so
  // avvio runs it strictly after `registerOpenApiDocument`'s (registrations run in the order
  // they were queued). `fastifyPlugin` (fp) marks it so `setErrorHandler`/`setNotFoundHandler`/
  // `addHook` calls inside apply to the whole app — the root scope — instead of being scoped to
  // this callback's own encapsulation child, preserving the same global behavior as calling them
  // directly on `app`.
  app.register(
    fastifyPlugin(async (instance: FastifyInstance) => {
      instance.addHook("onRequest", async (request, reply) => {
        reply.header(CORRELATION_ID_HEADER, request.id);
        reply.header("x-content-type-options", "nosniff");
        reply.header("referrer-policy", "no-referrer");
        reply.header("cache-control", "no-store");
      });

      instance.addHook("onResponse", async (request, reply) => {
        // request.log is a child logger bound with `requestIdLogLabel: correlationId` above, so
        // the correlation id is already present on every line without repeating it here.
        request.log.info(
          {
            method: request.method,
            path: request.url.split("?")[0],
            statusCode: reply.statusCode,
            responseTimeMs: reply.elapsedTime,
            remoteAddress: request.ip,
          },
          "request completed",
        );
      });

      registerErrorHandling(instance);
      registerHealthRoutes(instance, readinessChecks);
      registerOpenApiDocumentRoute(instance);
    }),
  );

  if (deps.db !== undefined) {
    app.decorate("db", deps.db);
  }
  if (deps.redis !== undefined) {
    app.decorate("redis", deps.redis);
  }

  return app;
}
