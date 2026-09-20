import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOpenApiArtifacts } from "./artifacts.js";
import { isMainModule, runCli } from "./cli.js";
import { OPENAPI_DOCS_DIR } from "./paths.js";
import { writeOpenApiArtifacts } from "./write.js";

export interface OpenApiDriftEntry {
  readonly path: string;
  readonly kind: "changed" | "missing" | "unexpected";
}

async function readFileIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function listSchemaFileNames(schemasDir: string): Promise<string[]> {
  try {
    const entries = await readdir(schemasDir);
    return entries.filter((name) => name.endsWith(".schema.json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Regenerates the OpenAPI document and JSON Schemas into a throwaway temp directory and diffs
 * them against the committed `docs/openapi/` — the real directory is only ever read, never
 * written, so a failing check leaves the working tree untouched. Returns the list of files that
 * differ (empty means the committed docs are up to date).
 */
export async function checkOpenApiDrift(): Promise<OpenApiDriftEntry[]> {
  const artifacts = await buildOpenApiArtifacts();
  const tempDir = await mkdtemp(join(tmpdir(), "ibook-openapi-check-"));

  try {
    await writeOpenApiArtifacts(artifacts, tempDir);

    const diffs: OpenApiDriftEntry[] = [];

    const committedDocument = await readFileIfExists(join(OPENAPI_DOCS_DIR, "openapi.json"));
    const generatedDocument = await readFile(join(tempDir, "openapi.json"), "utf8");
    if (committedDocument !== generatedDocument) {
      diffs.push({
        path: "openapi.json",
        kind: committedDocument === undefined ? "missing" : "changed",
      });
    }

    const committedSchemaNames = new Set(
      await listSchemaFileNames(join(OPENAPI_DOCS_DIR, "schemas")),
    );
    const generatedSchemaNames = new Set(await listSchemaFileNames(join(tempDir, "schemas")));

    for (const name of generatedSchemaNames) {
      if (!committedSchemaNames.has(name)) {
        diffs.push({ path: `schemas/${name}`, kind: "missing" });
        continue;
      }
      const committed = await readFile(join(OPENAPI_DOCS_DIR, "schemas", name), "utf8");
      const generated = await readFile(join(tempDir, "schemas", name), "utf8");
      if (committed !== generated) {
        diffs.push({ path: `schemas/${name}`, kind: "changed" });
      }
    }

    for (const name of committedSchemaNames) {
      if (!generatedSchemaNames.has(name)) {
        diffs.push({ path: `schemas/${name}`, kind: "unexpected" });
      }
    }

    return diffs;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function describeDiff(diff: OpenApiDriftEntry): string {
  const relPath = `docs/openapi/${diff.path}`;
  switch (diff.kind) {
    case "changed":
      return `  changed: ${relPath}`;
    case "missing":
      return `  missing (would be generated): ${relPath}`;
    case "unexpected":
      return `  stale (no longer generated — delete it): ${relPath}`;
    default:
      return `  ${relPath}`;
  }
}

async function main(): Promise<void> {
  const diffs = await checkOpenApiDrift();

  if (diffs.length === 0) {
    process.stdout.write("docs/openapi is up to date with the Zod schemas.\n");
    return;
  }

  process.stderr.write(
    "docs/openapi is out of date with the Zod schemas. Run `pnpm openapi:generate` and commit " +
      `the result. ${diffs.length} file(s) differ:\n${diffs.map(describeDiff).join("\n")}\n`,
  );
  process.exitCode = 1;
}

if (isMainModule(import.meta.url)) {
  runCli(main);
}
