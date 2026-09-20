import { defineConfig } from "drizzle-kit";

// drizzle-kit `generate` diffs the schema below against the migrations already in `out` — it
// does not need a reachable database. `dbCredentials` is only exercised by drizzle-kit commands
// we don't use here (push, introspect, studio); our own runner is src/migrate.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      process.env.TEST_DATABASE_URL ??
      "postgres://ibook:ibook_dev_only@127.0.0.1:55432/ibook",
  },
});
