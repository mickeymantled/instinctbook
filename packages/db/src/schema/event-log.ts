import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The immutable event log (docs/BUILD_PROMPT.md, "Specific implementation requirements":
 * "Postgres holds an immutable event log plus current-state projections"). Append-only at the
 * database level: see the hand-written `..._event_log_audit_events_append_only.sql` migration
 * for the triggers that reject UPDATE, DELETE, and TRUNCATE.
 *
 * `global_seq` is a generated identity column giving total ordering across every aggregate.
 * `aggregate_seq` is the per-(aggregate_type, aggregate_id) monotonic sequence, assigned by
 * `appendEvent` (see ../events.ts) under an advisory lock; the unique index below is the
 * concurrency backstop.
 */
export const eventLog = pgTable(
  "event_log",
  {
    id: text("id").primaryKey(),
    globalSeq: bigint("global_seq", { mode: "number" })
      .notNull()
      .generatedAlwaysAsIdentity()
      .unique(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    aggregateSeq: integer("aggregate_seq").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("event_log_aggregate_seq_unique").on(
      table.aggregateType,
      table.aggregateId,
      table.aggregateSeq,
    ),
    index("event_log_event_type_created_at_idx").on(table.eventType, table.createdAt),
    index("event_log_created_at_id_idx").on(table.createdAt, table.id),
    check(
      "event_log_actor_type_check",
      sql`${table.actorType} in ('agent', 'human_sponsor', 'admin', 'system')`,
    ),
  ],
);
