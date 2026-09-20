import { z } from "zod";

/**
 * Stable machine-readable error codes used across every ibook API response. Keep this list
 * append-only: removing or renaming a value is a protocol change (docs/BUILD_PROMPT.md build
 * order stop condition).
 */
export const ProblemCode = {
  VALIDATION_FAILED: "validation_failed",
  UNKNOWN_FIELD: "unknown_field",
  NOT_FOUND: "not_found",
  METHOD_NOT_ALLOWED: "method_not_allowed",
  UNSUPPORTED_MEDIA_TYPE: "unsupported_media_type",
  PAYLOAD_TOO_LARGE: "payload_too_large",
  RATE_LIMITED: "rate_limited",
  INTERNAL_ERROR: "internal_error",
  SERVICE_UNAVAILABLE: "service_unavailable",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  INSTINCT_VERIFICATION_REQUIRED: "instinct_verification_required",
  IDEMPOTENCY_KEY_REQUIRED: "idempotency_key_required",
  IDEMPOTENCY_CONFLICT: "idempotency_conflict",
  SIGNATURE_INVALID: "signature_invalid",
  REPLAY_DETECTED: "replay_detected",
  TIMESTAMP_OUT_OF_WINDOW: "timestamp_out_of_window",
} as const;

export type ProblemCode = (typeof ProblemCode)[keyof typeof ProblemCode];

const PROBLEM_CODE_VALUES = Object.values(ProblemCode) as [ProblemCode, ...ProblemCode[]];

/**
 * A single field-level validation failure. Never echoes the submitted value.
 *
 * Registered with a stable `.meta({ id })` so it appears once under
 * `#/components/schemas/ProblemErrorItem` in the generated OpenAPI document (and as its own
 * standalone JSON Schema file) instead of being inlined at every reference.
 */
export const ProblemErrorItemSchema = z
  .strictObject({
    path: z.string(),
    message: z.string(),
  })
  .meta({
    id: "ProblemErrorItem",
    description: "A single field-level failure. `path` names the field; the value is never echoed.",
  });

export type ProblemErrorItem = z.infer<typeof ProblemErrorItemSchema>;

/**
 * application/problem+json body shape (RFC 9457-flavored) used by every ibook API error
 * response. Strict: unknown fields are rejected, matching the "reject unknown fields on
 * writes" rule applied consistently to our own wire format.
 *
 * Registered with a stable `.meta({ id })` so it appears once under `#/components/schemas/Problem`
 * in the generated OpenAPI document (and as its own standalone JSON Schema file) instead of
 * being inlined at every error response across every route.
 */
export const ProblemSchema = z
  .strictObject({
    type: z.string().default("about:blank"),
    title: z.string(),
    status: z.int(),
    code: z.enum(PROBLEM_CODE_VALUES),
    retryable: z.boolean(),
    correlation_id: z.string(),
    detail: z.string(),
    errors: z.array(ProblemErrorItemSchema).optional(),
    retry_after_seconds: z.int().optional(),
  })
  .meta({
    id: "Problem",
    description:
      "RFC 9457 application/problem+json error body used by every ibook API error response.",
    examples: [
      {
        type: "about:blank",
        title: "forbidden",
        status: 403,
        code: ProblemCode.FORBIDDEN,
        retryable: false,
        correlation_id: "cor_01H0000000000000000000000",
        detail: "This action is not permitted.",
      },
    ],
  });

export type Problem = z.infer<typeof ProblemSchema>;
