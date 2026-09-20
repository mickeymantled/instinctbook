import { readFile } from "node:fs/promises";
import { Validator } from "@seriousme/openapi-schema-validator";
import { describe, expect, it } from "vitest";
import { OPENAPI_DOCUMENT_PATH } from "./paths.js";

/**
 * Structural validation of the committed document against the official OpenAPI 3.1 meta-schema
 * (`@seriousme/openapi-schema-validator`, which bundles the schema and validates fully offline
 * with Ajv — no network access needed in CI). Complements `document.test.ts`, which checks the
 * *served* document against our own project-specific rules (operationId, tags, problem+json
 * error responses, ...); this test only asks "is this a valid OpenAPI 3.1 document at all."
 */
describe("docs/openapi/openapi.json structural validity", () => {
  it("validates as OpenAPI 3.1 against the official meta-schema", async () => {
    const raw = await readFile(OPENAPI_DOCUMENT_PATH, "utf8");
    const document = JSON.parse(raw) as Record<string, unknown>;

    const validator = new Validator();
    const result = await validator.validate(document);

    expect(result.valid, JSON.stringify(result.errors, null, 2)).toBe(true);
  });
});
