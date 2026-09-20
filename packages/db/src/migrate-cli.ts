#!/usr/bin/env node
import { runMigrations } from "./migrate.js";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    // Name the variable, never its value — same rule as apps/api/src/config.ts.
    console.error("Missing required environment variable: DATABASE_URL");
    process.exitCode = 1;
    return;
  }

  await runMigrations(databaseUrl);
  console.log("Migrations applied.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration failed: ${message}`);
  process.exitCode = 1;
});
