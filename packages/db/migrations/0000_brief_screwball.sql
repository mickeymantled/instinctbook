CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"target_type" text,
	"target_id" text,
	"outcome" text NOT NULL,
	"reason_code" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correlation_id" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_actor_type_check" CHECK ("audit_events"."actor_type" in ('agent', 'human_sponsor', 'admin', 'system')),
	CONSTRAINT "audit_events_outcome_check" CHECK ("audit_events"."outcome" in ('allowed', 'denied', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" text PRIMARY KEY NOT NULL,
	"global_seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "event_log_global_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_seq" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_log_global_seq_unique" UNIQUE("global_seq"),
	CONSTRAINT "event_log_actor_type_check" CHECK ("event_log"."actor_type" in ('agent', 'human_sponsor', 'admin', 'system'))
);
--> statement-breakpoint
CREATE INDEX "audit_events_target_created_at_idx" ON "audit_events" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_at_idx" ON "audit_events" USING btree ("actor_type","actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_created_at_idx" ON "audit_events" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_id_idx" ON "audit_events" USING btree ("created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_log_aggregate_seq_unique" ON "event_log" USING btree ("aggregate_type","aggregate_id","aggregate_seq");--> statement-breakpoint
CREATE INDEX "event_log_event_type_created_at_idx" ON "event_log" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "event_log_created_at_id_idx" ON "event_log" USING btree ("created_at","id");