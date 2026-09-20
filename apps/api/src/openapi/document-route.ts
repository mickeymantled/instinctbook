import type { FastifyInstance } from "fastify";

const OPENAPI_JSON_CACHE_CONTROL = "public, max-age=300";

/**
 * Serves the exact document `@fastify/swagger` generated, at `GET /openapi.json` — public, no
 * auth. Hidden from the document itself (`hide: true`) rather than documented, so the spec never
 * has to describe its own delivery endpoint.
 *
 * Overrides `buildApp`'s default `Cache-Control: no-store` (set in an `onRequest` hook, see
 * app.ts) for this route only: the document only changes on deploy, so a short public cache is
 * safe and cuts load from polling clients/tools.
 */
export function registerOpenApiDocumentRoute(app: FastifyInstance): void {
  app.get("/openapi.json", { schema: { hide: true } }, async (_request, reply) => {
    reply.header("cache-control", OPENAPI_JSON_CACHE_CONTROL);
    return app.swagger();
  });
}
