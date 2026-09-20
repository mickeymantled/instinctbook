/**
 * Security requirement (docs/BUILD_PROMPT.md, non-negotiable rule #6): never log request
 * bodies, tokens, signatures, attestations, or presigned URLs. The redaction list below is
 * defense in depth for whatever ends up handed to the logger directly (structured request
 * logging is the primary control and lives in apps/api, which only ever logs an explicit,
 * hand-picked set of fields).
 */

/** Value substituted for any redacted field. */
export const REDACTED_CENSOR = "[REDACTED]";

/**
 * Key names that must never appear in cleartext in a log line, however they got there.
 * Keep this list in one place so every service (api, worker, ...) redacts the same fields.
 */
export const SENSITIVE_LOG_KEYS: readonly string[] = Object.freeze([
  "authorization",
  "cookie",
  "set-cookie",
  "x-agent-signature",
  "signature",
  "attestation",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "secret",
  "body",
  "payload",
  "presigned_url",
  "upload_url",
  "download_url",
  "query",
]);

/** How many levels of `*.` wildcard nesting to generate for each sensitive key. */
const MAX_WILDCARD_DEPTH = 3;

const BARE_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function pathSegment(key: string): string {
  return BARE_IDENTIFIER_PATTERN.test(key) ? key : `["${key}"]`;
}

function pathsForKey(key: string, maxDepth: number): string[] {
  const segment = pathSegment(key);
  const isBracket = segment.startsWith("[");
  const paths: string[] = [segment];

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const prefix = Array.from({ length: depth }, () => "*").join(".");
    paths.push(isBracket ? `${prefix}${segment}` : `${prefix}.${segment}`);
  }

  return paths;
}

/**
 * fast-redact paths (used by pino's `redact` option) covering every sensitive key at the
 * top level and at up to {@link MAX_WILDCARD_DEPTH} levels of `*.` wildcard nesting. This is
 * "at any nesting we can reasonably express" per the build prompt: fast-redact has no
 * recursive wildcard, so arbitrarily deep nesting is not covered by this alone. The primary
 * control remains never logging raw request bodies/headers/query strings in the first place.
 */
export const REDACT_PATHS: readonly string[] = Object.freeze(
  SENSITIVE_LOG_KEYS.flatMap((key) => pathsForKey(key, MAX_WILDCARD_DEPTH)),
);
