import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq, sql } from "drizzle-orm";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type { Database } from "./client.js";
import { newId } from "./ids.js";
import type * as schema from "./schema/index.js";
import { auditEvents, eventLog } from "./schema/index.js";

/** A drizzle transaction over the full ibook schema, as handed to a `db.transaction()` callback. */
export type Transaction = PgTransaction<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Either a plain database handle or an open transaction — anywhere a query can be issued. */
export type DbOrTx = Database | Transaction;

export type ActorType = "agent" | "human_sponsor" | "admin" | "system";
export type AuditOutcome = "allowed" | "denied" | "succeeded" | "failed";

export type EventLogRow = typeof eventLog.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;

export interface AppendEventInput {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload?: Record<string, unknown> | undefined;
  readonly actorType: ActorType;
  readonly actorId?: string | undefined;
  readonly correlationId?: string | undefined;
}

/**
 * Appends an event to `event_log`, assigning the next `aggregate_seq` for
 * `(aggregateType, aggregateId)`. Must be called with a transaction already opened by the
 * caller (e.g. `db.transaction(async (tx) => appendEvent(tx, {...}))`) — this function does not
 * open its own transaction, since callers typically need to write other rows in the same one.
 *
 * Concurrency: takes `pg_advisory_xact_lock(hashtext(aggregate_type || ':' || aggregate_id))`
 * before reading the current max `aggregate_seq`, so two concurrent transactions appending to
 * the same aggregate serialize on the lock instead of racing to read the same max and both
 * computing the same "next" value. The advisory lock is released automatically when the
 * transaction ends (commit or rollback). The unique index on
 * `(aggregate_type, aggregate_id, aggregate_seq)` is the backstop if that invariant is ever
 * violated by a caller that bypasses this function.
 */
export async function appendEvent(tx: Transaction, input: AppendEventInput): Promise<EventLogRow> {
  const lockKey = `${input.aggregateType}:${input.aggregateId}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

  const [current] = await tx
    .select({ maxSeq: sql<number>`coalesce(max(${eventLog.aggregateSeq}), 0)` })
    .from(eventLog)
    .where(
      and(
        eq(eventLog.aggregateType, input.aggregateType),
        eq(eventLog.aggregateId, input.aggregateId),
      ),
    );

  const nextSeq = (current?.maxSeq ?? 0) + 1;

  const [row] = await tx
    .insert(eventLog)
    .values({
      id: newId("evt"),
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      aggregateSeq: nextSeq,
      eventType: input.eventType,
      payload: input.payload ?? {},
      actorType: input.actorType,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    })
    .returning();

  if (row === undefined) {
    throw new Error("appendEvent: insert returned no row");
  }

  return row;
}

export interface RecordAuditInput {
  readonly action: string;
  readonly actorType: ActorType;
  readonly actorId?: string | undefined;
  readonly targetType?: string | undefined;
  readonly targetId?: string | undefined;
  readonly outcome: AuditOutcome;
  readonly reasonCode?: string | undefined;
  /** Metadata only — never request bodies, tokens, signatures, or attestations. */
  readonly metadata?: Record<string, unknown> | undefined;
  readonly correlationId?: string | undefined;
  readonly ipHash?: string | undefined;
}

/** Records an audit event. Accepts either a plain database handle or an open transaction. */
export async function recordAudit(dbOrTx: DbOrTx, input: RecordAuditInput): Promise<AuditEventRow> {
  const [row] = await dbOrTx
    .insert(auditEvents)
    .values({
      id: newId("aud"),
      action: input.action,
      actorType: input.actorType,
      outcome: input.outcome,
      metadata: input.metadata ?? {},
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      ...(input.ipHash !== undefined ? { ipHash: input.ipHash } : {}),
    })
    .returning();

  if (row === undefined) {
    throw new Error("recordAudit: insert returned no row");
  }

  return row;
}
