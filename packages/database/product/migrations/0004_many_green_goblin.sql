CREATE TYPE "public"."access_request_event_action" AS ENUM('SUBMITTED', 'APPROVED', 'DENIED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."institution_access_request_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
CREATE TABLE "access_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" "access_request_event_action" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "institution_access_requests" DROP CONSTRAINT "institution_access_requests_decision_shape_check";--> statement-breakpoint
DROP INDEX "institution_access_requests_user_institution_unique";--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD COLUMN "requested_role" "institution_access_role";--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD COLUMN "institutional_email" text;--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD COLUMN "institutional_code" text;--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD COLUMN "request_reason" text;--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "access_request_events" ADD CONSTRAINT "access_request_events_request_id_institution_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."institution_access_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_request_events" ADD CONSTRAINT "access_request_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_request_events_request_idx" ON "access_request_events" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "institution_access_requests_one_pending_unique" ON "institution_access_requests" USING btree ("user_id","institution_id") WHERE "institution_access_requests"."status" = 'PENDING';--> statement-breakpoint
ALTER TABLE "institution_access_requests" ADD CONSTRAINT "institution_access_requests_decision_shape_check" CHECK (
        (
          (
            "institution_access_requests"."status" = 'PENDING'
            AND "institution_access_requests"."assigned_role" IS NULL
            AND "institution_access_requests"."decided_by_user_id" IS NULL
            AND "institution_access_requests"."decided_at" IS NULL
          )
          OR
          (
            "institution_access_requests"."status" = 'APPROVED'
            AND "institution_access_requests"."assigned_role" IS NOT NULL
            AND "institution_access_requests"."decided_by_user_id" IS NOT NULL
            AND "institution_access_requests"."decided_at" IS NOT NULL
          )
          OR
          (
            "institution_access_requests"."status" = 'DENIED'
            AND "institution_access_requests"."assigned_role" IS NULL
            AND "institution_access_requests"."decided_by_user_id" IS NOT NULL
            AND "institution_access_requests"."decided_at" IS NOT NULL
          )
          OR
          (
            "institution_access_requests"."status"::text = 'CANCELLED'
            AND "institution_access_requests"."assigned_role" IS NULL
            AND "institution_access_requests"."decided_by_user_id" IS NULL
            AND "institution_access_requests"."decided_at" IS NOT NULL
          )
        )
      );