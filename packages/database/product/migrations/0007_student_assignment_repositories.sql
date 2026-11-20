CREATE TABLE "assignment_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"template" text NOT NULL,
	"repository_url" text
);
--> statement-breakpoint
ALTER TABLE "assignment_repositories" ADD CONSTRAINT "assignment_repositories_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_repositories" ADD CONSTRAINT "assignment_repositories_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_repository_student" ON "assignment_repositories" USING btree ("activity_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_repository_name" ON "assignment_repositories" USING btree ("owner","name");