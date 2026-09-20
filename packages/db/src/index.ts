export const PACKAGE_NAME = "@ibook/db" as const;

export type { CreateDbOptions, Database, Db } from "./client.js";
export { createDb, pingDb } from "./client.js";
export type {
  ActorType,
  AppendEventInput,
  AuditEventRow,
  AuditOutcome,
  DbOrTx,
  EventLogRow,
  RecordAuditInput,
  Transaction,
} from "./events.js";
export { appendEvent, recordAudit } from "./events.js";
export type { IdPrefix } from "./ids.js";
export { ID_PREFIXES, isId, newId } from "./ids.js";
export { runMigrations } from "./migrate.js";
export { auditEvents, eventLog } from "./schema/index.js";
