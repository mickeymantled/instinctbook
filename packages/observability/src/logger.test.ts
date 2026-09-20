import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { createLoggerOptions } from "./logger.js";

const MARKER = "sk_live_super_secret_marker_value";

function captureStream(): { stream: Writable; lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return { stream, lines: () => chunks.join("").split("\n").filter(Boolean) };
}

describe("createLoggerOptions", () => {
  it("redacts sensitive top-level and nested keys, never leaking the value", () => {
    const { stream, lines } = captureStream();
    const logger = pino(
      createLoggerOptions({ service: "test-service", env: "test", level: "info" }),
      stream,
    );

    logger.info(
      {
        token: MARKER,
        attestation: MARKER,
        presigned_url: `https://example.com/upload?sig=${MARKER}`,
        nested: { token: MARKER, secret: MARKER },
        safe: "this stays",
      },
      "sensitive payload",
    );

    const output = lines().join("\n");
    expect(output).not.toContain(MARKER);
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("this stays");
    expect(output).toContain("test-service");
  });

  it("keeps base fields (service, env) on every line", () => {
    const { stream, lines } = captureStream();
    const logger = pino(
      createLoggerOptions({ service: "ibook-api", env: "production", level: "info" }),
      stream,
    );

    logger.info("hello");

    const record = JSON.parse(lines()[0] ?? "{}") as Record<string, unknown>;
    expect(record.service).toBe("ibook-api");
    expect(record.env).toBe("production");
  });
});
