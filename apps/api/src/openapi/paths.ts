import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT_MARKER = "pnpm-workspace.yaml";
const MAX_WALK_UP = 12;

/**
 * Walks up from `startDir` looking for the repo root (marked by `pnpm-workspace.yaml`), rather
 * than hardcoding a fixed number of `../` segments. Works the same whether this module is
 * running from `src` (via tsx in dev) or from the compiled `dist` output, since both sit at the
 * same depth under `apps/api`.
 */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < MAX_WALK_UP; i++) {
    if (existsSync(join(dir, REPO_ROOT_MARKER))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(`Could not locate the repo root (${REPO_ROOT_MARKER}) above "${startDir}".`);
}

export const REPO_ROOT: string = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
export const API_PACKAGE_JSON_PATH: string = join(REPO_ROOT, "apps", "api", "package.json");
export const OPENAPI_DOCS_DIR: string = join(REPO_ROOT, "docs", "openapi");
export const OPENAPI_SCHEMAS_DIR: string = join(OPENAPI_DOCS_DIR, "schemas");
export const OPENAPI_DOCUMENT_PATH: string = join(OPENAPI_DOCS_DIR, "openapi.json");
