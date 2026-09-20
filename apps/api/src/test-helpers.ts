import { Writable } from "node:stream";
import type { BuildAppDeps } from "./app.js";
import { buildApp } from "./app.js";
import type { Config } from "./config.js";
import { loadConfig } from "./config.js";

/** Not a test file itself (no `*.test.ts` suffix) — shared helpers for the suites below. */

export interface StreamCapture {
  readonly stream: Writable;
  /** Raw captured output, concatenated. */
  text(): string;
  /** Captured output split into parsed JSON log lines. */
  lines(): Array<Record<string, unknown>>;
}

export function captureStream(): StreamCapture {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });

  return {
    stream,
    text: () => chunks.join(""),
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

/**
 * Placeholder connection strings, not read by anything: most tests using this helper build an
 * app with no `db`/`redis` deps (see {@link buildTestApp}), so nothing ever actually connects
 * with these — they only need to satisfy `loadConfig`'s required-field validation.
 */
const PLACEHOLDER_DATABASE_URL = "postgres://ibook:test@127.0.0.1:55432/ibook_test_placeholder";
const PLACEHOLDER_REDIS_URL = "redis://127.0.0.1:56379/0";

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: PLACEHOLDER_DATABASE_URL,
    REDIS_URL: PLACEHOLDER_REDIS_URL,
    ...overrides,
  });
}

export interface TestApp {
  readonly app: ReturnType<typeof buildApp>;
  readonly capture: StreamCapture;
}

/**
 * Builds an app wired to an in-memory log stream so tests can assert on what was logged. Log
 * level defaults to "info" here (unlike {@link testConfig}'s "silent" default) since most tests
 * using this helper want to inspect log output.
 */
export function buildTestApp(deps: Partial<BuildAppDeps> = {}): TestApp {
  const capture = captureStream();
  const config = deps.config ?? testConfig({ LOG_LEVEL: "info" });
  const app = buildApp({
    config,
    logger: deps.logger ?? { stream: capture.stream },
    readinessChecks: deps.readinessChecks ?? {},
  });
  return { app, capture };
}
