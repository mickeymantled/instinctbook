import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import type { Attributes, Span } from "@opentelemetry/api";

/**
 * Privacy requirement (docs/BUILD_PROMPT.md non-negotiable rule #6, slice 1.5 item 2): HTTP
 * spans must record the request path WITHOUT the query string. Query strings can carry tokens,
 * signatures, or other sensitive values, so they must never reach the trace exporter.
 */
function stripQuery(pathOrUrl: string): string {
  const index = pathOrUrl.indexOf("?");
  return index === -1 ? pathOrUrl : pathOrUrl.slice(0, index);
}

function targetFrom(raw: unknown): string | undefined {
  return typeof raw === "string" ? stripQuery(raw) : undefined;
}

/**
 * `startIncomingSpanHook` for `@opentelemetry/instrumentation-http`: runs before the server
 * span is created, so the query string never makes it into the span's initial attributes.
 * `url.query` is blanked outright rather than left to the instrumentation's own default
 * redaction (which only masks a built-in list of known-sensitive parameter *names* — this
 * codebase's rule is stricter: no query string at all, regardless of key name).
 */
export function sanitizeIncomingSpanAttributes(request: IncomingMessage): Attributes {
  const target = targetFrom(request.url);
  return target === undefined ? {} : { "http.target": target, "url.path": target, "url.query": "" };
}

/**
 * `startOutgoingSpanHook` for `@opentelemetry/instrumentation-http`: same idea, for outgoing
 * (client) requests this process makes.
 */
export function sanitizeOutgoingSpanAttributes(options: RequestOptions): Attributes {
  const target = targetFrom(options.path);
  return target === undefined ? {} : { "http.target": target, "url.path": target, "url.query": "" };
}

/**
 * `requestHook` for `@opentelemetry/instrumentation-http`: belt-and-suspenders re-application
 * once the span already exists, overwriting whatever the instrumentation's own default
 * attribute-setting logic put there (including any attribute name carrying the full URL or a
 * separate `url.query` attribute, which would otherwise still include the query string).
 */
export function sanitizeHttpRequestSpan(
  span: Span,
  request: ClientRequest | IncomingMessage,
): void {
  const raw = "path" in request ? request.path : request.url;
  const target = targetFrom(raw);
  if (target === undefined) {
    return;
  }
  span.setAttribute("http.target", target);
  span.setAttribute("http.url", target);
  span.setAttribute("url.full", target);
  span.setAttribute("url.path", target);
  span.setAttribute("url.query", "");
}
