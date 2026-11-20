ALTER TYPE "public"."institution_audit_action" ADD VALUE 'APPLICANT_UPDATED';--> statement-breakpoint
ALTER TYPE "public"."institution_audit_action" ADD VALUE 'MEMBERSHIP_RESTORED';--> statement-breakpoint
CREATE TABLE "institution_admin_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"status" "institution_access_request_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid
);
--> statement-breakpoint
ALTER TABLE "institution_admin_requests" ADD CONSTRAINT "institution_admin_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_admin_requests" ADD CONSTRAINT "institution_admin_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_admin_requests" ADD CONSTRAINT "institution_admin_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "institution_admin_request_pending" ON "institution_admin_requests" USING btree ("user_id","institution_id") WHERE "institution_admin_requests"."status" = 'PENDING';