import type { FastifyServerOptions } from "fastify";
import Fastify, { LogController } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Config } from "./config.js";
import { CORRELATION_ID_PATTERN, generateCorrelationId } from "./correlation.js";
import { registerErrorHandling } from "./errors.js";
import type { ReadinessChecks } from "./health.js";
import { registerHealthRoutes } from "./health.js";
import type { LoggerOverrides } from "./logger.js";
import { createLogger } from "./logger.js";

const ONE_MEBIBYTE = 1_048_576;
const CORRELATION_ID_LOG_LABEL = "correlationId";
const CORRELATION_ID_HEADER = "x-correlation-id";

export interface BuildAppDeps {
  readonly config: Config;
  /** Logger construction overrides. Tests pass a stream here to capture log output. */
  readonly logger?: LoggerOverrides;
  /** Dependency health checks run by GET /readyz. Defaults to none. */
  readonly readinessChecks?: ReadinessChecks;
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

  app.addHook("onRequest", async (request, reply) => {
    reply.header(CORRELATION_ID_HEADER, request.id);
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("cache-control", "no-store");
  });

  app.addHook("onResponse", async (request, reply) => {
    // request.log is a child logger bound with `requestIdLogLabel: correlationId` above, so the
    // correlation id is already present on every line without repeating it here.
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

  registerErrorHandling(app);
  registerHealthRoutes(app, readinessChecks);

  return app;
}
