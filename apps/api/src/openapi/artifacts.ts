import { z } from "zod";
import { buildApp } from "../app.js";
import type { Config } from "../config.js";
import { loadConfig } from "../config.js";
import { toDeterministicJson } from "./canonical-json.js";

/**
 * Placeholder connection strings, never actually connected to: `buildApp` only decorates
 * `app.db`/`app.redis` when a caller passes `db`/`redis` in `BuildAppDeps` (see app.ts), and
 * this module never does. They exist purely to satisfy `loadConfig`'s required-field
 * validation, and are fixed literals (not read from `process.env`) so document generation never
 * depends on — or varies with — the machine or environment it runs in.
 */
const DOCS_ONLY_DATABASE_URL = "postgres://ibook:docs-only@127.0.0.1:55432/ibook_docs_only";
const DOCS_ONLY_REDIS_URL = "redis://127.0.0.1:56379/0";

const SCHEMA_URI_BASE = "https://ibook.dev/schemas";

function buildDocsOnlyConfig(): Config {
  return loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: DOCS_ONLY_DATABASE_URL,
    REDIS_URL: DOCS_ONLY_REDIS_URL,
  });
}

export interface OpenApiArtifacts {
  /** `docs/openapi/openapi.json` contents: deterministic JSON, 2-space indent, trailing LF. */
  readonly openapiJson: string;
  /** `docs/openapi/schemas/<Name>.schema.json` contents, keyed by `"<Name>.schema.json"`. */
  readonly schemaFiles: ReadonlyMap<string, string>;
}

/**
 * Builds the OpenAPI 3.1 document and every standalone JSON Schema component, purely in memory
 * — no filesystem writes (see `writeOpenApiArtifacts` in write.ts for that) and no real
 * Postgres/Redis connection, since the app here is built with neither `db` nor `redis`
 * decorated (`buildApp` already supports that; see app.ts's `BuildAppDeps`). Safe to call
 * repeatedly and concurrently in-process — each call builds and tears down its own app — which
 * is what the determinism test relies on.
 */
export async function buildOpenApiArtifacts(): Promise<OpenApiArtifacts> {
  const app = buildApp({ config: buildDocsOnlyConfig() });

  try {
    await app.ready();
    const document = app.swagger();
    const openapiJson = toDeterministicJson(document);

    const { schemas } = z.toJSONSchema(z.globalRegistry, {
      target: "draft-2020-12",
      uri: (id) => `${SCHEMA_URI_BASE}/${id}.schema.json`,
    });

    const schemaFiles = new Map<string, string>();
    for (const [id, schema] of Object.entries(schemas)) {
      schemaFiles.set(`${id}.schema.json`, toDeterministicJson(schema));
    }

    return { openapiJson, schemaFiles };
  } finally {
    await app.close();
  }
}
