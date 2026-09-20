import http from "node:http";
import type { AddressInfo } from "node:net";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  sanitizeHttpRequestSpan,
  sanitizeIncomingSpanAttributes,
  sanitizeOutgoingSpanAttributes,
} from "./http-sanitize.js";
import { initTelemetry } from "./telemetry.js";

const MARKER = "sk_live_super_secret_marker_value";

describe("initTelemetry", () => {
  it("is a no-op (returns a no-op shutdown) when OTEL_EXPORTER_OTLP_ENDPOINT is unset", async () => {
    const previous = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    try {
      const shutdown = initTelemetry({
        serviceName: "test-service",
        serviceVersion: "0.0.0",
        env: "test",
      });
      await expect(shutdown()).resolves.toBeUndefined();
    } finally {
      if (previous !== undefined) {
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previous;
      }
    }
  });
});

/**
 * Privacy requirement (docs/BUILD_PROMPT.md non-negotiable rule #6, slice 1.5 item 2): drives a
 * real HTTP request — with marker strings planted in the query string, in headers
 * (Authorization/Cookie/X-Agent-Signature), and in the body — through the actual, sanitized
 * `HttpInstrumentation` config this package ships, exported through a real in-memory span
 * exporter, and asserts the marker never appears in any exported span attribute.
 */
describe("http instrumentation privacy (in-memory exporter, real request)", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;
  let instrumentation: HttpInstrumentation;
  let unregister: () => void;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();

    instrumentation = new HttpInstrumentation({
      startIncomingSpanHook: sanitizeIncomingSpanAttributes,
      startOutgoingSpanHook: sanitizeOutgoingSpanAttributes,
      requestHook: sanitizeHttpRequestSpan,
    });
    unregister = registerInstrumentations({
      instrumentations: [instrumentation],
      tracerProvider: provider,
    });

    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok", receivedBodyLength: Buffer.concat(chunks).length }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    unregister();
    instrumentation.disable();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await provider.shutdown();
  });

  it("never lets the marker reach an exported span attribute or span name", async () => {
    exporter.reset();

    await new Promise<void>((resolve, reject) => {
      const request = http.request(
        `${baseUrl}/v1/posts?token=${MARKER}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${MARKER}`,
            cookie: `session=${MARKER}`,
            "x-agent-signature": MARKER,
            "content-type": "application/json",
          },
        },
        (response) => {
          response.on("data", () => {});
          response.on("end", resolve);
        },
      );
      request.on("error", reject);
      request.end(JSON.stringify({ secret: MARKER }));
    });

    // SimpleSpanProcessor exports synchronously as each span ends, but the outgoing (client)
    // span and the incoming (server) span end at slightly different points in the event loop
    // relative to the response's 'end' event; give both a tick to land.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);

    for (const span of spans) {
      expect(span.name).not.toContain(MARKER);
      const serializedAttributes = JSON.stringify(span.attributes);
      expect(serializedAttributes).not.toContain(MARKER);

      // Explicit check on the attributes the requirement calls out by name.
      expect(span.attributes["http.target"]).not.toBeUndefined();
      const target = span.attributes["http.target"];
      if (typeof target === "string") {
        expect(target).not.toContain("?");
      }
    }
  });
});
