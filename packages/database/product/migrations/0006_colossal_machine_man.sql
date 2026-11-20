CREATE TYPE "public"."activity_kind" AS ENUM('REPOSITORY', 'LINK', 'TEXT');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."course_member_role" AS ENUM('TEACHER', 'STUDENT');--> statement-breakpoint
CREATE TYPE "public"."course_member_status" AS ENUM('ACTIVE', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
ALTER TYPE "public"."institution_audit_action" ADD VALUE 'INSTITUTION_CREATED';--> statement-breakpoint
CREATE TABLE "access_request_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"from_admin" boolean NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text NOT NULL,
	"rubric" text,
	"kind" "activity_kind" NOT NULL,
	"template_repo_url" text,
	"resource_url" text,
	"max_score" integer,
	"due_at" timestamp with time zone,
	"allow_late" boolean DEFAULT true NOT NULL,
	"status" "activity_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "course_member_role" NOT NULL,
	"status" "course_member_status" DEFAULT 'ACTIVE' NOT NULL,
	"group_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"status" "course_status" DEFAULT 'ACTIVE' NOT NULL,
	"join_code" text NOT NULL,
	"join_enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"content_url" text,
	"commit_sha" text,
	"text_content" text,
	"is_late" boolean NOT NULL,
	"feedback" text,
	"score" numeric(6, 2),
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "accent_color" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_deadlines" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_feedback" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "access_request_messages" ADD CONSTRAINT "access_request_messages_request_id_institution_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."institution_access_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_request_messages" ADD CONSTRAINT "access_request_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_members" ADD CONSTRAINT "course_members_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_members" ADD CONSTRAINT "course_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_request_messages_request_idx" ON "access_request_messages" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "activities_course_idx" ON "activities" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_members_course_user_unique" ON "course_members" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "course_members_user_idx" ON "course_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_join_code_unique" ON "courses" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "courses_institution_idx" ON "courses" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_activity_student_attempt_unique" ON "submissions" USING btree ("activity_id","student_user_id","attempt");--> statement-breakpoint
CREATE INDEX "submissions_student_idx" ON "submissions" USING btree ("student_user_id");