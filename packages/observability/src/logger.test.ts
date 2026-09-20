import { Writable } from "node:stream";
import { context, trace } from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
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

  it("adds trace_id/span_id when a span is active, and omits them otherwise", async () => {
    const { stream, lines } = captureStream();
    const logger = pino(
      createLoggerOptions({ service: "test-service", env: "test", level: "info" }),
      stream,
    );

    logger.info("no span active");
    const withoutSpan = JSON.parse(lines()[0] ?? "{}") as Record<string, unknown>;
    expect(withoutSpan.trace_id).toBeUndefined();
    expect(withoutSpan.span_id).toBeUndefined();

    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    // Registers this provider's context manager globally, so `context.active()`/`context.with()`
    // (used below, and internally by the pino `mixin` under test) actually propagate the span —
    // without a registered context manager the default is a no-op that never tracks it.
    provider.register();
    const tracer = provider.getTracer("logger.test");
    const span = tracer.startSpan("test-span");

    await context.with(trace.setSpan(context.active(), span), async () => {
      logger.info("span active");
    });
    span.end();
    await provider.shutdown();

    const withSpan = JSON.parse(lines()[1] ?? "{}") as Record<string, unknown>;
    const spanContext = span.spanContext();
    expect(withSpan.trace_id).toBe(spanContext.traceId);
    expect(withSpan.span_id).toBe(spanContext.spanId);
  });
});
