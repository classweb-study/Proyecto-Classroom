ALTER TYPE "public"."institution_audit_action" ADD VALUE 'INSTITUTION_REMOVED' BEFORE 'APPLICANT_UPDATED';--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "removed_at" timestamp with time zone;
--> statement-breakpoint
CREATE FUNCTION require_available_institution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM institutions WHERE id = NEW.institution_id AND removed_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Institution unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER require_available_membership BEFORE INSERT OR UPDATE ON institution_memberships
FOR EACH ROW WHEN (NEW.status = 'ACTIVE') EXECUTE FUNCTION require_available_institution();
--> statement-breakpoint
CREATE TRIGGER require_available_access_request BEFORE INSERT ON institution_access_requests
FOR EACH ROW EXECUTE FUNCTION require_available_institution();
--> statement-breakpoint
CREATE TRIGGER require_available_admin_request BEFORE INSERT ON institution_admin_requests
FOR EACH ROW EXECUTE FUNCTION require_available_institution();
