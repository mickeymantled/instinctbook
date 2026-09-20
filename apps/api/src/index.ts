export const PACKAGE_NAME = "@ibook/api" as const;

export type { BuildAppDeps } from "./app.js";
export { buildApp } from "./app.js";
export type { Config } from "./config.js";
export { loadConfig } from "./config.js";
export { AppError } from "./errors.js";
export type { ReadinessChecks } from "./health.js";
