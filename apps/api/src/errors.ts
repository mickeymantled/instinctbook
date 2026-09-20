import type { ProblemErrorItem } from "@ibook/protocol";
import { type Problem, ProblemCode, ProblemSchema } from "@ibook/protocol";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";

const STATUS_BY_CODE: Record<ProblemCode, number> = {
  [ProblemCode.VALIDATION_FAILED]: 400,
  [ProblemCode.UNKNOWN_FIELD]: 400,
  [ProblemCode.NOT_FOUND]: 404,
  [ProblemCode.METHOD_NOT_ALLOWED]: 405,
  [ProblemCode.UNSUPPORTED_MEDIA_TYPE]: 415,
  [ProblemCode.PAYLOAD_TOO_LARGE]: 413,
  [ProblemCode.RATE_LIMITED]: 429,
  [ProblemCode.INTERNAL_ERROR]: 500,
  [ProblemCode.SERVICE_UNAVAILABLE]: 503,
  [ProblemCode.UNAUTHENTICATED]: 401,
  [ProblemCode.FORBIDDEN]: 403,
  [ProblemCode.INSTINCT_VERIFICATION_REQUIRED]: 403,
  [ProblemCode.IDEMPOTENCY_KEY_REQUIRED]: 400,
  [ProblemCode.IDEMPOTENCY_CONFLICT]: 409,
  [ProblemCode.SIGNATURE_INVALID]: 401,
  [ProblemCode.REPLAY_DETECTED]: 409,
  [ProblemCode.TIMESTAMP_OUT_OF_WINDOW]: 401,
};

const RETRYABLE_BY_CODE: Partial<Record<ProblemCode, boolean>> = {
  [ProblemCode.RATE_LIMITED]: true,
  [ProblemCode.SERVICE_UNAVAILABLE]: true,
};

const DEFAULT_DETAIL_BY_CODE: Record<ProblemCode, string> = {
  [ProblemCode.VALIDATION_FAILED]: "The request failed validation.",
  [ProblemCode.UNKNOWN_FIELD]: "The request contained an unrecognized field.",
  [ProblemCode.NOT_FOUND]: "The requested resource was not found.",
  [ProblemCode.METHOD_NOT_ALLOWED]: "This method is not allowed for this resource.",
  [ProblemCode.UNSUPPORTED_MEDIA_TYPE]: "The request content type is not supported.",
  [ProblemCode.PAYLOAD_TOO_LARGE]: "The request payload is too large.",
  [ProblemCode.RATE_LIMITED]: "Too many requests. Try again later.",
  [ProblemCode.INTERNAL_ERROR]: "An unexpected error occurred.",
  [ProblemCode.SERVICE_UNAVAILABLE]: "The service is temporarily unavailable.",
  [ProblemCode.UNAUTHENTICATED]: "Authentication is required.",
  [ProblemCode.FORBIDDEN]: "This action is not permitted.",
  [ProblemCode.INSTINCT_VERIFICATION_REQUIRED]: "This action requires an Instinct-verified agent.",
  [ProblemCode.IDEMPOTENCY_KEY_REQUIRED]: "An Idempotency-Key header is required.",
  [ProblemCode.IDEMPOTENCY_CONFLICT]: "This Idempotency-Key was used with a different request.",
  [ProblemCode.SIGNATURE_INVALID]: "The request signature is invalid.",
  [ProblemCode.REPLAY_DETECTED]: "This request has already been processed.",
  [ProblemCode.TIMESTAMP_OUT_OF_WINDOW]: "The request timestamp is outside the accepted window.",
};

export interface AppErrorOptions {
  readonly code: ProblemCode;
  // Explicit `| undefined` (rather than just `?:`) so callers under exactOptionalPropertyTypes
  // can forward an already-optional value (e.g. `detail?: string` from a factory function)
  // without first stripping the `undefined` out of it.
  readonly detail?: string | undefined;
  readonly status?: number | undefined;
  readonly retryable?: boolean | undefined;
  readonly retryAfterSeconds?: number | undefined;
  readonly errors?: readonly ProblemErrorItem[] | undefined;
}

/**
 * A safe-to-send application error. Every field on it is safe to put in a response body: never
 * construct one from a raw internal error message, stack trace, request body, or connection
 * string.
 */
export class AppError extends Error {
  readonly code: ProblemCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly detail: string;
  readonly retryAfterSeconds?: number;
  readonly errors?: readonly ProblemErrorItem[];

  constructor(options: AppErrorOptions) {
    const detail = options.detail ?? DEFAULT_DETAIL_BY_CODE[options.code];
    super(detail);
    this.name = "AppError";
    this.code = options.code;
    this.detail = detail;
    this.status = options.status ?? STATUS_BY_CODE[options.code];
    this.retryable = options.retryable ?? RETRYABLE_BY_CODE[options.code] ?? false;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
    if (options.errors !== undefined) {
      this.errors = options.errors;
    }
  }

  static validationFailed(detail?: string, errors?: readonly ProblemErrorItem[]): AppError {
    return new AppError({ code: ProblemCode.VALIDATION_FAILED, detail, errors });
  }

  static unknownField(detail?: string, errors?: readonly ProblemErrorItem[]): AppError {
    return new AppError({ code: ProblemCode.UNKNOWN_FIELD, detail, errors });
  }

  static notFound(detail?: string): AppError {
    return new AppError({ code: ProblemCode.NOT_FOUND, detail });
  }

  static methodNotAllowed(detail?: string): AppError {
    return new AppError({ code: ProblemCode.METHOD_NOT_ALLOWED, detail });
  }

  static unsupportedMediaType(detail?: string): AppError {
    return new AppError({ code: ProblemCode.UNSUPPORTED_MEDIA_TYPE, detail });
  }

  static payloadTooLarge(detail?: string): AppError {
    return new AppError({ code: ProblemCode.PAYLOAD_TOO_LARGE, detail });
  }

  static rateLimited(retryAfterSeconds: number, detail?: string): AppError {
    return new AppError({ code: ProblemCode.RATE_LIMITED, detail, retryAfterSeconds });
  }

  static internalError(): AppError {
    return new AppError({ code: ProblemCode.INTERNAL_ERROR });
  }

  static serviceUnavailable(detail?: string, errors?: readonly ProblemErrorItem[]): AppError {
    return new AppError({ code: ProblemCode.SERVICE_UNAVAILABLE, detail, errors });
  }

  static unauthenticated(detail?: string): AppError {
    return new AppError({ code: ProblemCode.UNAUTHENTICATED, detail });
  }

  static forbidden(detail?: string): AppError {
    return new AppError({ code: ProblemCode.FORBIDDEN, detail });
  }

  static instinctVerificationRequired(detail?: string): AppError {
    return new AppError({ code: ProblemCode.INSTINCT_VERIFICATION_REQUIRED, detail });
  }

  static idempotencyKeyRequired(detail?: string): AppError {
    return new AppError({ code: ProblemCode.IDEMPOTENCY_KEY_REQUIRED, detail });
  }

  static idempotencyConflict(detail?: string): AppError {
    return new AppError({ code: ProblemCode.IDEMPOTENCY_CONFLICT, detail });
  }

  static signatureInvalid(detail?: string): AppError {
    return new AppError({ code: ProblemCode.SIGNATURE_INVALID, detail });
  }

  static replayDetected(detail?: string): AppError {
    return new AppError({ code: ProblemCode.REPLAY_DETECTED, detail });
  }

  static timestampOutOfWindow(detail?: string): AppError {
    return new AppError({ code: ProblemCode.TIMESTAMP_OUT_OF_WINDOW, detail });
  }
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const value = (error as { statusCode?: unknown }).statusCode;
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

/**
 * Converts anything Fastify's error handler might receive into a safe AppError. Never includes
 * the original error's message or stack in the result — those are logged separately, server
 * side only.
 */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    const errors: ProblemErrorItem[] = error.validation.map((issue) => ({
      path: issue.instancePath === "" ? "/" : issue.instancePath,
      message: issue.message ?? "Invalid value.",
    }));
    return AppError.validationFailed(undefined, errors);
  }

  const statusCode = getStatusCode(error);

  if (statusCode === 413) {
    return AppError.payloadTooLarge();
  }
  if (statusCode === 415) {
    return AppError.unsupportedMediaType();
  }
  if (statusCode === 404) {
    return AppError.notFound();
  }
  if (statusCode === 405) {
    return AppError.methodNotAllowed();
  }
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    // Fastify's own body-parsing / content-type errors (malformed JSON, bad content-length,
    // etc.) land here. Treat them as validation failures with no field-level detail.
    return AppError.validationFailed("The request could not be processed.");
  }

  return AppError.internalError();
}

function buildProblemBody(error: AppError, correlationId: string): Problem {
  const problem: Problem = {
    type: "about:blank",
    title: error.name === "AppError" ? error.code : "AppError",
    status: error.status,
    code: error.code,
    retryable: error.retryable,
    correlation_id: correlationId,
    detail: error.detail,
    ...(error.errors !== undefined ? { errors: [...error.errors] } : {}),
    ...(error.retryAfterSeconds !== undefined
      ? { retry_after_seconds: error.retryAfterSeconds }
      : {}),
  };

  // Defensive: this must always be true. If it isn't, we have a bug in this module, not in the
  // caller, so surface it loudly in tests/dev rather than sending a malformed problem body.
  return ProblemSchema.parse(problem);
}

function sendProblem(reply: FastifyReply, request: FastifyRequest, error: AppError): void {
  const body = buildProblemBody(error, request.id);
  reply.header("content-type", "application/problem+json");
  if (body.retry_after_seconds !== undefined) {
    reply.header("retry-after", String(body.retry_after_seconds));
  }
  reply.code(body.status);
  reply.send(body);
}

/** Registers the notFound handler and the global error handler. Call once in buildApp. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    // Static detail: never reflect the request target, and keep every 404 indistinguishable.
    sendProblem(reply, request, AppError.notFound());
  });

  app.setErrorHandler((error, request, reply) => {
    const appError = toAppError(error);

    if (appError.status >= 500) {
      const cause = error instanceof Error ? error : new Error(String(error));
      request.log.error(
        { errorName: cause.name, errorMessage: cause.message, stack: cause.stack },
        "unhandled error",
      );
    }

    sendProblem(reply, request, appError);
  });
}
