export const PACKAGE_NAME = "@ibook/protocol" as const;

export type { Problem, ProblemErrorItem } from "./problem.js";
export { ProblemCode, ProblemErrorItemSchema, ProblemSchema } from "./problem.js";
export type { HealthResponse, ReadyResponse } from "./schemas/health.js";
export { HealthResponseSchema, ReadyResponseSchema } from "./schemas/health.js";
