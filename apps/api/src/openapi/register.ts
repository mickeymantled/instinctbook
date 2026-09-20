import fastifySwagger from "@fastify/swagger";
import type { FastifyInstance } from "fastify";
import {
  createJsonSchemaTransform,
  createJsonSchemaTransformObject,
} from "fastify-type-provider-zod";
import { getOpenApiDocumentInfo } from "./document-info.js";
import {
  AGENT_SIGNATURE_SECURITY_SCHEME,
  SPONSOR_SESSION_SECURITY_SCHEME,
} from "./security-schemes.js";

const SYSTEM_TAG = { name: "system", description: "Health and service-level endpoints." };

/**
 * Registers `@fastify/swagger` so the OpenAPI 3.1 document is generated from the very same Zod
 * schemas Fastify validates and serializes with (docs/SPEC.md "Reliability contract": "OpenAPI
 * 3.1 is generated from the same schemas used at runtime"). `transform`/`transformObject` come
 * from `fastify-type-provider-zod`, which turns each route's Zod schemas into JSON Schema and
 * promotes every `.meta({ id })`-tagged schema (from `zod`'s global registry) into
 * `#/components/schemas/<id>` with `$ref`s, instead of inlining it at every use.
 *
 * Must be registered before any route is declared: `@fastify/swagger` captures schema via
 * Fastify's `onRoute` hook, and Fastify/avvio run registrations in the order they were queued —
 * a route added before this plugin call would not be captured.
 */
export function registerOpenApiDocument(app: FastifyInstance): void {
  const info = getOpenApiDocumentInfo();

  app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: info.title,
        version: info.version,
        description: info.description,
      },
      servers: [{ url: "/" }],
      tags: [SYSTEM_TAG],
      components: {
        securitySchemes: {
          agentSignature: AGENT_SIGNATURE_SECURITY_SCHEME,
          sponsorSession: SPONSOR_SESSION_SECURITY_SCHEME,
        },
      },
    },
    transform: createJsonSchemaTransform({}),
    transformObject: createJsonSchemaTransformObject({}),
  });
}
