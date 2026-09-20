import { ProblemSchema } from "@ibook/protocol";

/**
 * Per-status descriptions for the `problemResponses` helper below. Extend this map (never guess
 * a description inline at the call site) whenever a route needs a status code not yet listed
 * here — keeps every route's documented error responses reading the same way.
 */
const PROBLEM_DESCRIPTION_BY_STATUS: Readonly<Record<number, string>> = {
  400: "The request failed validation, or contained an unrecognized field.",
  401: "Authentication is required, missing, or invalid.",
  403: "This action is not permitted for the authenticated caller.",
  404: "The requested resource was not found.",
  405: "This method is not allowed for this resource.",
  409: "The request conflicts with the current state of the resource.",
  413: "The request payload is too large.",
  415: "The request content type is not supported.",
  429: "Too many requests. Retry after the interval in the Retry-After header.",
  500: "An unexpected error occurred.",
  503: "The service is temporarily unavailable. Retry after the interval in the Retry-After header.",
};

export interface ProblemResponseEntry {
  readonly description: string;
  readonly content: {
    readonly "application/problem+json": {
      readonly schema: typeof ProblemSchema;
    };
  };
}

/**
 * Builds `response` entries for the given HTTP status codes, each documented as an
 * `application/problem+json` body referencing the shared `Problem` component
 * (docs/SPEC.md "Reliability contract": errors use application/problem+json with code,
 * retryable, correlation_id, and safe detail). Spread the result into a route's
 * `schema.response`:
 *
 * ```ts
 * response: { 200: SomeResponseSchema, ...problemResponses(401, 403, 404) }
 * ```
 */
export function problemResponses(
  ...statusCodes: readonly number[]
): Record<number, ProblemResponseEntry> {
  const responses: Record<number, ProblemResponseEntry> = {};

  for (const status of statusCodes) {
    const description = PROBLEM_DESCRIPTION_BY_STATUS[status];
    if (description === undefined) {
      throw new Error(
        `problemResponses: no description configured for HTTP status ${status}. Add one to ` +
          "PROBLEM_DESCRIPTION_BY_STATUS in apps/api/src/openapi/problem-responses.ts.",
      );
    }
    responses[status] = {
      description,
      content: { "application/problem+json": { schema: ProblemSchema } },
    };
  }

  return responses;
}
