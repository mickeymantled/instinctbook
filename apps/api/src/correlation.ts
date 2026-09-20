import { ulid } from "ulid";

/** Inbound `X-Correlation-Id` must match this shape to be trusted and echoed back. */
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** IDs follow the repo-wide `<prefix>_<ULID>` convention (docs/DECISIONS.md D-019). */
export function generateCorrelationId(): string {
  return `cor_${ulid()}`;
}

/**
 * Picks the correlation id for a request: the inbound `X-Correlation-Id` header if present and
 * well-formed, otherwise a freshly generated one. A malformed or oversized inbound value is
 * never trusted or echoed back — a fresh id is generated instead.
 */
export function resolveCorrelationId(headerValue: string | string[] | undefined): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (candidate !== undefined && CORRELATION_ID_PATTERN.test(candidate)) {
    return candidate;
  }
  return generateCorrelationId();
}
