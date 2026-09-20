import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendEvent, recordAudit } from "./events.js";
import { createTestDatabase, type TestDatabase } from "./testing.js";

/**
 * drizzle-orm's node-postgres driver wraps a failed query in a `DrizzleQueryError` whose own
 * `.message` is just "Failed query: <sql>" — the underlying Postgres error (raised by
 * `ibook_reject_mutation()`, errcode P0001) lands on `.cause`. Assert against that.
 */
async function expectAppendOnlyRejection(promise: Promise<unknown>): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  const cause = (caught as { cause?: unknown }).cause;
  expect(cause).toBeInstanceOf(Error);
  expect((cause as { code?: unknown }).code).toBe("P0001");
  expect((cause as Error).message).toMatch(/is append-only/);
}

describe("append-only enforcement", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  async function seedEvent() {
    return testDb.db.transaction((tx) =>
      appendEvent(tx, {
        aggregateType: "test_aggregate",
        aggregateId: "append-only-checks",
        eventType: "test.happened",
        actorType: "system",
      }),
    );
  }

  async function seedAudit() {
    return recordAudit(testDb.db, {
      action: "test.action",
      actorType: "system",
      outcome: "succeeded",
    });
  }

  describe("event_log", () => {
    it("rejects UPDATE", async () => {
      const row = await seedEvent();
      await expectAppendOnlyRejection(
        testDb.db.execute(sql`update event_log set event_type = 'changed' where id = ${row.id}`),
      );
    });

    it("rejects DELETE", async () => {
      const row = await seedEvent();
      await expectAppendOnlyRejection(
        testDb.db.execute(sql`delete from event_log where id = ${row.id}`),
      );
    });

    it("rejects TRUNCATE", async () => {
      await expectAppendOnlyRejection(testDb.db.execute(sql`truncate event_log`));
    });
  });

  describe("audit_events", () => {
    it("rejects UPDATE", async () => {
      const row = await seedAudit();
      await expectAppendOnlyRejection(
        testDb.db.execute(sql`update audit_events set action = 'changed' where id = ${row.id}`),
      );
    });

    it("rejects DELETE", async () => {
      const row = await seedAudit();
      await expectAppendOnlyRejection(
        testDb.db.execute(sql`delete from audit_events where id = ${row.id}`),
      );
    });

    it("rejects TRUNCATE", async () => {
      await expectAppendOnlyRejection(testDb.db.execute(sql`truncate audit_events`));
    });
  });
});
