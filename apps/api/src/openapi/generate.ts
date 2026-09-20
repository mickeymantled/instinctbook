import { buildOpenApiArtifacts } from "./artifacts.js";
import { isMainModule, runCli } from "./cli.js";
import { OPENAPI_DOCS_DIR } from "./paths.js";
import { writeOpenApiArtifacts } from "./write.js";

/** Builds the OpenAPI document and JSON Schemas and writes them to `docs/openapi/`. */
export async function generateOpenApiDocs(): Promise<void> {
  const artifacts = await buildOpenApiArtifacts();
  await writeOpenApiArtifacts(artifacts, OPENAPI_DOCS_DIR);
}

async function main(): Promise<void> {
  await generateOpenApiDocs();
  process.stdout.write(`Wrote OpenAPI document and schemas to ${OPENAPI_DOCS_DIR}\n`);
}

if (isMainModule(import.meta.url)) {
  runCli(main);
}
