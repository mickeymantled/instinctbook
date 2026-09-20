import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `apps/api/package.json`, resolved relative to this module's own location rather than via
 * `./paths.js`'s `API_PACKAGE_JSON_PATH` (which walks up looking for the repo's
 * `pnpm-workspace.yaml`). `readApiVersion` below runs at normal server boot — including from a
 * `pnpm deploy` production image (infra/docker/api.Dockerfile), which is deliberately a
 * standalone directory with no `pnpm-workspace.yaml` above it — whereas `paths.js`'s
 * repo-root-walking is only meant for the `openapi:generate`/`openapi:check` CLI scripts, which
 * always run from a full repo checkout. This file and `dist/openapi/package-version.js` sit at
 * the same depth under `apps/api` either way (`src/openapi` or `dist/openapi`), so walking up
 * two fixed levels is sufficient and never needs the repo root.
 */
const PACKAGE_JSON_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");

let cachedVersion: string | undefined;

/**
 * Reads `apps/api/package.json`'s `"version"` field. The file cannot change mid-process, so the
 * result is cached after the first read.
 */
export function readApiVersion(): string {
  if (cachedVersion !== undefined) {
    return cachedVersion;
  }

  const raw = readFileSync(PACKAGE_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error(`${PACKAGE_JSON_PATH} is missing a non-empty string "version" field.`);
  }

  cachedVersion = parsed.version;
  return cachedVersion;
}
