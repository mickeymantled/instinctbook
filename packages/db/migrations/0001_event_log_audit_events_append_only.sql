-- Enforces "Postgres holds an immutable event log" (docs/BUILD_PROMPT.md) at the database
-- level, not just in application code: event_log and audit_events become append-only. Any
-- UPDATE, DELETE, or TRUNCATE against either table is rejected, regardless of which role or
-- code path attempts it.
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ibook_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = format('table %I is append-only', TG_TABLE_NAME);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER event_log_reject_update
  BEFORE UPDATE ON "event_log"
  FOR EACH ROW EXECUTE FUNCTION ibook_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER event_log_reject_delete
  BEFORE DELETE ON "event_log"
  FOR EACH ROW EXECUTE FUNCTION ibook_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER event_log_reject_truncate
  BEFORE TRUNCATE ON "event_log"
  FOR EACH STATEMENT EXECUTE FUNCTION ibook_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_reject_update
  BEFORE UPDATE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION ibook_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_reject_delete
  BEFORE DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION ibook_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_reject_truncate
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION ibook_reject_mutation();
