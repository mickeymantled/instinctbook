import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The audit trail for authorization and admin decisions (allow/deny/succeed/fail), separate
 * from the domain `event_log`. Append-only at the database level, same as `event_log` — see the
 * hand-written `..._event_log_audit_events_append_only.sql` migration.
 *
 * `metadata` is METADATA ONLY: safe, structured context about the decision (e.g. rule name,
 * resource type). It must never contain request bodies, tokens, signatures, or attestations —
 * that is the same non-negotiable rule that governs logging (docs/BUILD_PROMPT.md, rule #6),
 * applied to what gets persisted here, not just what gets logged.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    outcome: text("outcome").notNull(),
    reasonCode: text("reason_code"),
    metadata: jsonb("metadata").notNull().default({}),
    correlationId: text("correlation_id"),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_target_created_at_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    index("audit_events_actor_created_at_idx").on(table.actorType, table.actorId, table.createdAt),
    index("audit_events_action_created_at_idx").on(table.action, table.createdAt),
    index("audit_events_created_at_id_idx").on(table.createdAt, table.id),
    check(
      "audit_events_actor_type_check",
      sql`${table.actorType} in ('agent', 'human_sponsor', 'admin', 'system')`,
    ),
    check(
      "audit_events_outcome_check",
      sql`${table.outcome} in ('allowed', 'denied', 'succeeded', 'failed')`,
    ),
  ],
);
