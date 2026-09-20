import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { createTestDatabase, type TestDatabase } from "./testing.js";

async function listPublicTables(testDb: TestDatabase): Promise<string[]> {
  const result = await testDb.db.execute<{ table_name: string }>(sql`
    select table_name from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `);
  return result.rows.map((row) => row.table_name);
}

describe("runMigrations", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("applies cleanly to an empty Postgres 16 database", async () => {
    expect(await listPublicTables(testDb)).toEqual(["audit_events", "event_log"]);
  });

  it("running the migrator a second time is a no-op", async () => {
    await expect(runMigrations(testDb.url)).resolves.toBeUndefined();
    expect(await listPublicTables(testDb)).toEqual(["audit_events", "event_log"]);
  });
});

/**
 * Not exported from src/testing.ts: that helper always migrates as part of setup. This test
 * needs an un-migrated database so it can race two migrators against it.
 */
async function createEmptyDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  const adminUrl =
    process.env.TEST_DATABASE_URL ?? "postgres://ibook:ibook_dev_only@127.0.0.1:55432/ibook";
  const databaseName = `ibook_test_${randomBytes(6).toString("hex")}`;

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }

  const target = new URL(adminUrl);
  target.pathname = `/${databaseName}`;

  return {
    url: target.toString(),
    async drop() {
      const dropClient = new Client({ connectionString: adminUrl });
      await dropClient.connect();
      try {
        await dropClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      } finally {
        await dropClient.end();
      }
    },
  };
}

describe("concurrent migrators", () => {
  it("two migrators started concurrently against the same fresh database both succeed", async () => {
    const empty = await createEmptyDatabase();

    try {
      await Promise.all([runMigrations(empty.url), runMigrations(empty.url)]);

      const { db, close } = createDb(empty.url);
      try {
        const result = await db.execute<{ table_name: string }>(sql`
          select table_name from information_schema.tables
          where table_schema = 'public'
          order by table_name
        `);
        expect(result.rows.map((row) => row.table_name)).toEqual(["audit_events", "event_log"]);
      } finally {
        await close();
      }
    } finally {
      await empty.drop();
    }
  });
});
