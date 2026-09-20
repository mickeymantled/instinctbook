import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { Client } from "pg";
import type { Database } from "./client.js";
import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";

const DEFAULT_TEST_DATABASE_URL = "postgres://ibook:ibook_dev_only@127.0.0.1:55432/ibook";

function resolveAdminUrl(): string {
  return process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
}

function randomDatabaseName(): string {
  return `ibook_test_${randomBytes(6).toString("hex")}`;
}

/** Strips credentials before an admin URL ever ends up in an error message. */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return "<unparseable database url>";
  }
}

async function withMaintenanceClient<T>(
  adminUrl: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: adminUrl });

  try {
    await client.connect();
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not reach Postgres at ${redactUrl(adminUrl)} to set up a test database. ` +
        `Run "pnpm infra:up" and retry. (${cause})`,
    );
  }

  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export interface TestDatabase {
  /** Connection URL for the throwaway database (credentials included, for local use only). */
  readonly url: string;
  readonly db: Database;
  readonly pool: Pool;
  /** Closes the pool and drops the throwaway database. Call from `afterAll`. */
  drop(): Promise<void>;
}

/**
 * Creates a throwaway `ibook_test_<random>` database, migrates it, and returns a ready-to-use
 * drizzle handle plus a `drop()` cleanup function. Each call gets its own database, so test
 * files (and the tests within them) are isolated from each other and safe to run in parallel.
 *
 * Connects using `TEST_DATABASE_URL`, defaulting to the dev-infra Postgres started by
 * `pnpm infra:up` (`infra/docker/compose.dev.yaml`). If Postgres is unreachable this throws
 * loudly with a message pointing at that command, rather than letting tests silently skip.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = resolveAdminUrl();
  const databaseName = randomDatabaseName();

  await withMaintenanceClient(adminUrl, async (client) => {
    await client.query(`CREATE DATABASE "${databaseName}"`);
  });

  const targetUrl = new URL(adminUrl);
  targetUrl.pathname = `/${databaseName}`;
  const url = targetUrl.toString();

  await runMigrations(url);

  const { db, pool, close } = createDb(url);

  return {
    url,
    db,
    pool,
    async drop() {
      await close();
      await withMaintenanceClient(adminUrl, async (client) => {
        // PG16 supports WITH (FORCE), which disconnects any lingering sessions first, so a
        // pool connection this test forgot to release can never leak a database.
        await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      });
    },
  };
}
