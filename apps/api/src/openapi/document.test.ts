import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../test-helpers.js";
import { canonicalize } from "./canonical-json.js";
import { OPENAPI_DOCUMENT_PATH } from "./paths.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

interface OpenApiOperation {
  readonly operationId?: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly responses?: Record<string, { content?: Record<string, unknown> }>;
}

interface OpenApiDocument {
  readonly openapi: string;
  readonly components?: {
    readonly securitySchemes?: Record<string, unknown>;
    readonly schemas?: Record<string, unknown>;
  };
  readonly paths: Record<string, Record<string, OpenApiOperation>>;
}

async function fetchDocument(): Promise<{
  status: number;
  headers: Record<string, unknown>;
  document: OpenApiDocument;
}> {
  const { app } = buildTestApp();
  const response = await app.inject({ method: "GET", url: "/openapi.json" });
  return {
    status: response.statusCode,
    headers: response.headers,
    document: response.json() as OpenApiDocument,
  };
}

describe("GET /openapi.json", () => {
  it("is a 3.1.0 document with both security schemes and the Problem component", async () => {
    const { status, document } = await fetchDocument();

    expect(status).toBe(200);
    expect(document.openapi).toBe("3.1.0");
    expect(document.components?.securitySchemes?.agentSignature).toBeDefined();
    expect(document.components?.securitySchemes?.sponsorSession).toBeDefined();
    expect(document.components?.schemas?.Problem).toBeDefined();
  });

  it("gives every operation an operationId, a summary, and at least one tag", async () => {
    const { document } = await fetchDocument();
    let operationCount = 0;

    for (const [path, operations] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        if (!HTTP_METHODS.includes(method)) {
          continue;
        }
        operationCount += 1;
        expect(operation.operationId, `${method.toUpperCase()} ${path} operationId`).toBeTruthy();
        expect(operation.summary, `${method.toUpperCase()} ${path} summary`).toBeTruthy();
        expect(operation.tags?.length ?? 0, `${method.toUpperCase()} ${path} tags`).toBeGreaterThan(
          0,
        );
      }
    }

    expect(operationCount).toBeGreaterThan(0);
  });

  it("documents every non-2xx response as application/problem+json", async () => {
    const { document } = await fetchDocument();

    for (const [path, operations] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        if (!HTTP_METHODS.includes(method)) {
          continue;
        }
        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (status.startsWith("2")) {
            continue;
          }
          expect(
            Object.keys(response.content ?? {}),
            `${method.toUpperCase()} ${path} ${status} content types`,
          ).toEqual(["application/problem+json"]);
        }
      }
    }
  });

  it("hides itself from its own document", async () => {
    const { document } = await fetchDocument();
    expect(document.paths["/openapi.json"]).toBeUndefined();
  });

  it("sets a short public Cache-Control, overriding the app default no-store", async () => {
    const { headers } = await fetchDocument();
    expect(headers["cache-control"]).toBe("public, max-age=300");
  });

  it("deep-equals the committed docs/openapi/openapi.json (served doc equals the file)", async () => {
    const { document } = await fetchDocument();
    const served = canonicalize(document);

    const committedRaw = await readFile(OPENAPI_DOCUMENT_PATH, "utf8");
    const committed = canonicalize(JSON.parse(committedRaw));

    expect(served).toEqual(committed);
  });
});
