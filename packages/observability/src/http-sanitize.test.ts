import type { IncomingMessage, RequestOptions } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  sanitizeHttpRequestSpan,
  sanitizeIncomingSpanAttributes,
  sanitizeOutgoingSpanAttributes,
} from "./http-sanitize.js";

const MARKER = "sk_live_super_secret_marker_value";

function fakeSpan() {
  const attributes: Record<string, unknown> = {};
  return {
    setAttribute: vi.fn((key: string, value: unknown) => {
      attributes[key] = value;
    }),
    attributes,
  };
}

describe("sanitizeIncomingSpanAttributes", () => {
  it("strips the query string from the server-side request path", () => {
    const request = { url: `/v1/posts?token=${MARKER}` } as IncomingMessage;
    expect(sanitizeIncomingSpanAttributes(request)).toEqual({
      "http.target": "/v1/posts",
      "url.path": "/v1/posts",
      "url.query": "",
    });
  });

  it("returns no attributes when there is no url", () => {
    const request = {} as IncomingMessage;
    expect(sanitizeIncomingSpanAttributes(request)).toEqual({});
  });
});

describe("sanitizeOutgoingSpanAttributes", () => {
  it("strips the query string from the client-side request path", () => {
    const options = { path: `/v1/webhooks?secret=${MARKER}` } as RequestOptions;
    expect(sanitizeOutgoingSpanAttributes(options)).toEqual({
      "http.target": "/v1/webhooks",
      "url.path": "/v1/webhooks",
      "url.query": "",
    });
  });
});

describe("sanitizeHttpRequestSpan", () => {
  it("overwrites http.target/http.url/url.full/url.path with the query-free path, for a server request", () => {
    const span = fakeSpan();
    const request = { url: `/v1/agents/123:follow?nonce=${MARKER}` } as IncomingMessage;

    sanitizeHttpRequestSpan(span as never, request);

    for (const value of Object.values(span.attributes)) {
      expect(String(value)).not.toContain(MARKER);
    }
    expect(span.attributes["http.target"]).toBe("/v1/agents/123:follow");
    expect(span.attributes["url.full"]).toBe("/v1/agents/123:follow");
  });

  it("overwrites the same attributes for a client (outgoing) request, using request.path", () => {
    const span = fakeSpan();
    const request = { path: `/v1/webhooks/deliver?key=${MARKER}` } as unknown as IncomingMessage;

    sanitizeHttpRequestSpan(span as never, request);

    expect(span.attributes["http.target"]).toBe("/v1/webhooks/deliver");
    for (const value of Object.values(span.attributes)) {
      expect(String(value)).not.toContain(MARKER);
    }
  });

  it("does nothing when neither url nor path is a string", () => {
    const span = fakeSpan();
    sanitizeHttpRequestSpan(span as never, {} as IncomingMessage);
    expect(span.setAttribute).not.toHaveBeenCalled();
  });
});
