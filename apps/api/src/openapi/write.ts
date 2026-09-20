import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OpenApiArtifacts } from "./artifacts.js";
import { OPENAPI_DOCS_DIR } from "./paths.js";

/**
 * Writes `artifacts` under `docsDir` (`docs/openapi/openapi.json` and
 * `docs/openapi/schemas/<Name>.schema.json`) — defaulting to the real `docs/openapi/`, but
 * overridable so the drift check (`check.ts`) can write into a throwaway temp directory instead
 * and never touch the working tree.
 *
 * Deletes any `*.schema.json` file already under `<docsDir>/schemas` that isn't one of
 * `artifacts.schemaFiles`' keys, so a component removed from the source schemas doesn't leave a
 * stale generated file behind.
 */
export async function writeOpenApiArtifacts(
  artifacts: OpenApiArtifacts,
  docsDir: string = OPENAPI_DOCS_DIR,
): Promise<void> {
  const schemasDir = join(docsDir, "schemas");
  await mkdir(schemasDir, { recursive: true });

  await writeFile(join(docsDir, "openapi.json"), artifacts.openapiJson, "utf8");

  const existing = await readdir(schemasDir).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const wanted = artifacts.schemaFiles;

  await Promise.all(
    existing
      .filter((name) => name.endsWith(".schema.json") && !wanted.has(name))
      .map((name) => rm(join(schemasDir, name))),
  );

  await Promise.all(
    [...wanted.entries()].map(([name, content]) =>
      writeFile(join(schemasDir, name), content, "utf8"),
    ),
  );
}
