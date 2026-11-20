CREATE TYPE "public"."institution_audit_action" AS ENUM('MEMBERSHIP_REVOKED', 'MEMBERSHIP_ROLE_CHANGED', 'INSTITUTION_UPDATED', 'DOMAIN_ADDED', 'DOMAIN_REMOVED');--> statement-breakpoint
CREATE TABLE "institution_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" "institution_audit_action" NOT NULL,
	"target_user_id" uuid,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institution_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "institution_audit_events" ADD CONSTRAINT "institution_audit_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_audit_events" ADD CONSTRAINT "institution_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_audit_events" ADD CONSTRAINT "institution_audit_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_domains" ADD CONSTRAINT "institution_domains_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institution_audit_events_institution_created_idx" ON "institution_audit_events" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "institution_domains_institution_domain_unique" ON "institution_domains" USING btree ("institution_id","domain");