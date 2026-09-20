import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

/** The drizzle database handle used throughout ibook, typed against the full schema. */
export type Database = NodePgDatabase<typeof schema>;

const DEFAULT_MAX_CONNECTIONS = 10;
const DEFAULT_STATEMENT_TIMEOUT_MS = 10_000;
const DEFAULT_APPLICATION_NAME = "ibook";

export interface CreateDbOptions {
  /** Maximum pool size. Defaults to 10. */
  readonly max?: number;
  /** Per-statement timeout in ms, enforced server side. Defaults to 10s. */
  readonly statementTimeoutMs?: number;
  /** `application_name` reported to Postgres, useful in `pg_stat_activity`. Defaults to "ibook". */
  readonly applicationName?: string;
}

export interface Db {
  readonly db: Database;
  readonly pool: Pool;
  close(): Promise<void>;
}

/**
 * Creates a pooled Postgres connection plus a drizzle database handle over it. Callers own the
 * returned pool's lifecycle and must call `close()` on shutdown.
 */
export function createDb(databaseUrl: string, opts: CreateDbOptions = {}): Db {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: opts.max ?? DEFAULT_MAX_CONNECTIONS,
    statement_timeout: opts.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
    application_name: opts.applicationName ?? DEFAULT_APPLICATION_NAME,
  });

  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    async close() {
      await pool.end();
    },
  };
}

/** Readiness check: succeeds only if the pool can round-trip a trivial query. */
export async function pingDb(pool: Pool): Promise<void> {
  await pool.query("SELECT 1");
}
