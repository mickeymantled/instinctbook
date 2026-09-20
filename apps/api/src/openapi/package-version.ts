import { readFileSync } from "node:fs";
import { API_PACKAGE_JSON_PATH } from "./paths.js";

let cachedVersion: string | undefined;

/**
 * Reads `apps/api/package.json`'s `"version"` field. The file cannot change mid-process, so the
 * result is cached after the first read.
 */
export function readApiVersion(): string {
  if (cachedVersion !== undefined) {
    return cachedVersion;
  }

  const raw = readFileSync(API_PACKAGE_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error(`${API_PACKAGE_JSON_PATH} is missing a non-empty string "version" field.`);
  }

  cachedVersion = parsed.version;
  return cachedVersion;
}
