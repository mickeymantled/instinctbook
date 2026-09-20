import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

/**
 * Migrations live at the package root (`packages/db/migrations`), not under `src`, so they are
 * reachable both from `src/migrate.ts` (vitest, running from `src/`) and from the compiled
 * `dist/migrate.js` (running from `dist/`) by resolving one directory up from wherever this
 * module itself is loaded from, without any build step needing to copy files around.
 */
function resolveMigrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../migrations");
}

/**
 * Postgres advisory lock key for the migration runner. A fixed, arbitrary string hashed with
 * `hashtext` so concurrent starters (api + worker, or two test workers) serialize on a single
 * session-level lock instead of racing to apply migrations at once.
 */
const MIGRATION_LOCK_KEY = "ibook:migrations";

/**
 * Applies pending migrations from `packages/db/migrations` to `databaseUrl`. Safe to call
 * concurrently from multiple processes: a Postgres session-level advisory lock (held on a
 * dedicated connection for the duration of this call) makes concurrent callers queue up and run
 * the migrator one at a time. Running it again after all migrations have applied is a no-op.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  } finally {
    try {
      await client.query("select pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    } finally {
      await client.end();
    }
  }
}
