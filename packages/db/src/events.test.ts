import { asc } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActorType, AuditOutcome } from "./events.js";
import { appendEvent, recordAudit } from "./events.js";
import { eventLog } from "./schema/index.js";
import { createTestDatabase, type TestDatabase } from "./testing.js";

describe("events", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  describe("appendEvent", () => {
    it("assigns aggregate_seq 1, 2, 3... per aggregate, independent across aggregates", async () => {
      const a1 = await testDb.db.transaction((tx) =>
        appendEvent(tx, {
          aggregateType: "widget",
          aggregateId: "seq-w1",
          eventType: "created",
          actorType: "system",
        }),
      );
      const a2 = await testDb.db.transaction((tx) =>
        appendEvent(tx, {
          aggregateType: "widget",
          aggregateId: "seq-w1",
          eventType: "updated",
          actorType: "system",
        }),
      );
      const b1 = await testDb.db.transaction((tx) =>
        appendEvent(tx, {
          aggregateType: "widget",
          aggregateId: "seq-w2",
          eventType: "created",
          actorType: "system",
        }),
      );

      expect(a1.aggregateSeq).toBe(1);
      expect(a2.aggregateSeq).toBe(2);
      expect(b1.aggregateSeq).toBe(1);
    });

    it("produces exactly seq 1..20 with no gaps or dupes under 20 concurrent appends", async () => {
      const aggregateId = "seq-concurrent";

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          testDb.db.transaction((tx) =>
            appendEvent(tx, {
              aggregateType: "widget",
              aggregateId,
              eventType: `event-${i}`,
              actorType: "system",
            }),
          ),
        ),
      );

      const seqs = results.map((row) => row.aggregateSeq).sort((a, b) => a - b);
      expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });

    it("keeps global_seq strictly increasing across every row inserted so far", async () => {
      const rows = await testDb.db.select().from(eventLog).orderBy(asc(eventLog.globalSeq));

      expect(rows.length).toBeGreaterThan(0);
      for (let i = 1; i < rows.length; i += 1) {
        const previous = rows[i - 1];
        const current = rows[i];
        expect(previous).toBeDefined();
        expect(current).toBeDefined();
        expect(current?.globalSeq).toBeGreaterThan(previous?.globalSeq as number);
      }
    });

    it("rejects an invalid actor_type via the event_log CHECK constraint", async () => {
      const invalidActorType = "not_a_real_actor_type" as unknown as ActorType;

      await expect(
        testDb.db.transaction((tx) =>
          appendEvent(tx, {
            aggregateType: "widget",
            aggregateId: "seq-bad-actor",
            eventType: "created",
            actorType: invalidActorType,
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe("recordAudit", () => {
    it("inserts an audit row with metadata defaulting to {}", async () => {
      const row = await recordAudit(testDb.db, {
        action: "agent.write_attempt",
        actorType: "agent",
        outcome: "denied",
        reasonCode: "instinct_verification_required",
      });

      expect(row.action).toBe("agent.write_attempt");
      expect(row.actorType).toBe("agent");
      expect(row.outcome).toBe("denied");
      expect(row.reasonCode).toBe("instinct_verification_required");
      expect(row.metadata).toEqual({});
    });

    it("rejects an invalid outcome via the audit_events CHECK constraint", async () => {
      const invalidOutcome = "not_a_real_outcome" as unknown as AuditOutcome;

      await expect(
        recordAudit(testDb.db, {
          action: "agent.write_attempt",
          actorType: "agent",
          outcome: invalidOutcome,
        }),
      ).rejects.toThrow();
    });

    it("rejects an invalid actor_type via the audit_events CHECK constraint", async () => {
      const invalidActorType = "not_a_real_actor_type" as unknown as ActorType;

      await expect(
        recordAudit(testDb.db, {
          action: "agent.write_attempt",
          actorType: invalidActorType,
          outcome: "succeeded",
        }),
      ).rejects.toThrow();
    });
  });
});
