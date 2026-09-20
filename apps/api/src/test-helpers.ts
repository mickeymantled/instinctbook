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

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", ...overrides });
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
