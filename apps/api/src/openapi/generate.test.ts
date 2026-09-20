import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenApiArtifacts } from "./artifacts.js";
import { writeOpenApiArtifacts } from "./write.js";

describe("OpenAPI generation determinism", () => {
  it("produces byte-identical in-memory output across two independent runs", async () => {
    const [a, b] = await Promise.all([buildOpenApiArtifacts(), buildOpenApiArtifacts()]);

    expect(a.openapiJson).toBe(b.openapiJson);
    expect([...a.schemaFiles.keys()].sort()).toEqual([...b.schemaFiles.keys()].sort());
    for (const [name, content] of a.schemaFiles) {
      expect(content).toBe(b.schemaFiles.get(name));
    }
  });

  it("writes byte-identical files into two independent temp directories", async () => {
    const artifacts = await buildOpenApiArtifacts();
    const dirA = await mkdtemp(join(tmpdir(), "ibook-openapi-det-a-"));
    const dirB = await mkdtemp(join(tmpdir(), "ibook-openapi-det-b-"));

    try {
      await Promise.all([
        writeOpenApiArtifacts(artifacts, dirA),
        writeOpenApiArtifacts(artifacts, dirB),
      ]);

      const [filesA, filesB] = await Promise.all([
        readdir(join(dirA, "schemas")),
        readdir(join(dirB, "schemas")),
      ]);
      expect(filesA.sort()).toEqual(filesB.sort());
      expect(filesA.length).toBeGreaterThan(0);

      const [docA, docB] = await Promise.all([
        readFile(join(dirA, "openapi.json"), "utf8"),
        readFile(join(dirB, "openapi.json"), "utf8"),
      ]);
      expect(docA).toBe(docB);
      expect(docA.endsWith("\n")).toBe(true);

      for (const name of filesA) {
        const [contentA, contentB] = await Promise.all([
          readFile(join(dirA, "schemas", name), "utf8"),
          readFile(join(dirB, "schemas", name), "utf8"),
        ]);
        expect(contentA).toBe(contentB);
      }
    } finally {
      await Promise.all([
        rm(dirA, { recursive: true, force: true }),
        rm(dirB, { recursive: true, force: true }),
      ]);
    }
  });

  it("prunes a stale schema file that is no longer generated", async () => {
    const artifacts = await buildOpenApiArtifacts();
    const dir = await mkdtemp(join(tmpdir(), "ibook-openapi-prune-"));

    try {
      await writeOpenApiArtifacts(artifacts, dir);
      const schemasDir = join(dir, "schemas");

      const stale = new Map(artifacts.schemaFiles);
      const [firstName] = [...stale.keys()];
      if (firstName === undefined) {
        throw new Error("expected at least one generated schema file");
      }
      stale.delete(firstName);

      await writeOpenApiArtifacts({ ...artifacts, schemaFiles: stale }, dir);

      const remaining = await readdir(schemasDir);
      expect(remaining).not.toContain(firstName);
      expect(remaining.sort()).toEqual([...stale.keys()].sort());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
