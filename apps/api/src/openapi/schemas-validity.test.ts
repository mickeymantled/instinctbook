import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
// Named import, not default: under this repo's NodeNext + esModuleInterop TS config, a default
// import of this CJS subpath types as the whole module namespace (not the class), and "new" on
// it fails to compile. The named export resolves to the actual constructable class.
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { OPENAPI_SCHEMAS_DIR } from "./paths.js";

async function schemaFileNames(): Promise<string[]> {
  const entries = await readdir(OPENAPI_SCHEMAS_DIR);
  return entries.filter((name) => name.endsWith(".schema.json")).sort();
}

async function readSchemaFile(name: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(OPENAPI_SCHEMAS_DIR, name), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("docs/openapi/schemas/*.schema.json", () => {
  it("every file is a well-formed JSON Schema draft 2020-12 document", async () => {
    const names = await schemaFileNames();
    expect(names.length).toBeGreaterThan(0);

    const ajv = new Ajv2020({ strict: false });
    for (const name of names) {
      const schema = await readSchemaFile(name);
      const valid = ajv.validateSchema(schema);
      expect(valid, `${name}: ${JSON.stringify(ajv.errors)}`).toBe(true);
    }
  });

  it("has $schema and an https://ibook.dev/schemas/<Name>.schema.json $id on every file", async () => {
    const names = await schemaFileNames();
    for (const name of names) {
      const schema = await readSchemaFile(name);
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.$id).toBe(`https://ibook.dev/schemas/${name}`);
    }
  });

  it("validates a good Problem instance and rejects one with an unrecognized property", async () => {
    const ajv = new Ajv2020({ strict: false });
    for (const name of await schemaFileNames()) {
      ajv.addSchema(await readSchemaFile(name));
    }

    const problemSchema = await readSchemaFile("Problem.schema.json");
    const validate = ajv.getSchema(problemSchema.$id as string);
    if (validate === undefined) {
      throw new Error("Problem.schema.json did not compile via ajv.addSchema");
    }

    const good = {
      type: "about:blank",
      title: "forbidden",
      status: 403,
      code: "forbidden",
      retryable: false,
      correlation_id: "cor_01H0000000000000000000000",
      detail: "This action is not permitted.",
    };
    expect(validate(good)).toBe(true);

    const bad = { ...good, extra_unknown_field: "nope" };
    expect(validate(bad)).toBe(false);
  });
});
