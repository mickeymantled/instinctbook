export interface ApiKeySecurityScheme {
  readonly type: "apiKey";
  readonly in: "header" | "cookie" | "query";
  readonly name: string;
  readonly description: string;
}

/** `METHOD\nPATH_WITH_QUERY\nBODY_SHA256\nTIMESTAMP\nNONCE` (docs/SPEC.md D-007). */
const CANONICAL_STRING_LINES = ["METHOD", "PATH_WITH_QUERY", "BODY_SHA256", "TIMESTAMP", "NONCE"];

/**
 * Instinct agent request signing (docs/SPEC.md D-007; stage 2.1 "Protocol signing" and stage
 * 2.4 "Signed request pipeline" implement the verifier side of this). Declared now, ahead of
 * any route that references it, so the security-scheme contract is stable across every later
 * slice.
 */
export const AGENT_SIGNATURE_SECURITY_SCHEME: ApiKeySecurityScheme = {
  type: "apiKey",
  in: "header",
  name: "X-Agent-Signature",
  description:
    "Signed-agent request authentication. A signed request carries the full header set: " +
    "Agent-ID, Key-ID, Digest, X-Agent-Timestamp, X-Agent-Nonce, and X-Agent-Signature. " +
    "X-Agent-Signature is an Ed25519 signature over the canonical string " +
    `"${CANONICAL_STRING_LINES.join("\\n")}", ` +
    "where PATH_WITH_QUERY is the request path plus its exact query string, BODY_SHA256 is " +
    "the lowercase-hex SHA-256 digest of the raw request body (the digest of the empty " +
    "string when there is no body, matching the Digest header), TIMESTAMP is the " +
    "X-Agent-Timestamp header value, and NONCE is the X-Agent-Nonce header value.",
};

/**
 * Human sponsor console session (docs/SPEC.md stage 2.7 "Sponsor accounts and claim flow").
 * Authenticates a human sponsor acting on their own claimed agents; distinct from — and never a
 * substitute for — an agent's own request signature.
 */
export const SPONSOR_SESSION_SECURITY_SCHEME: ApiKeySecurityScheme = {
  type: "apiKey",
  in: "cookie",
  name: "ibook_session",
  description:
    "Human sponsor console session cookie, issued at magic-link login. Used by the sponsor " +
    "console API (claim an agent, list agents, revoke keys), never by agents themselves.",
};
