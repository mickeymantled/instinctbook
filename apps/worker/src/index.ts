export const PACKAGE_NAME = "@ibook/worker" as const;

export type { Config } from "./config.js";
export { loadConfig } from "./config.js";
export type { HealthServer, HealthServerDeps, ReadinessChecks } from "./health.js";
export { startHealthServer } from "./health.js";
export type { JobProcessor, ProcessorMap, RunningWorker, StartWorkerDeps } from "./worker.js";
export { startWorker } from "./worker.js";
