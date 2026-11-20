-- Preserve the owner's former memberships and the time access was withdrawn.
WITH revoked AS (
  UPDATE institution_memberships m SET status = 'REVOKED', updated_at = now()
  FROM github_identities g
  WHERE g.user_id = m.user_id AND g.github_user_id = 257880786 AND m.status = 'ACTIVE'
  RETURNING m.user_id, m.institution_id, m.role
)
INSERT INTO institution_audit_events (institution_id, actor_user_id, target_user_id, action, details)
SELECT institution_id, user_id, user_id, 'MEMBERSHIP_REVOKED', role::text FROM revoked;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- The same role may span institutions. Concurrent grants of different roles conflict.
ALTER TABLE institution_memberships ADD CONSTRAINT active_account_role_exclusive
EXCLUDE USING gist (user_id WITH =, role WITH <>) WHERE (status = 'ACTIVE');
--> statement-breakpoint
CREATE FUNCTION prevent_owner_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM github_identities WHERE user_id = NEW.user_id AND github_user_id = 257880786) THEN
    RAISE EXCEPTION 'The WebClass owner cannot hold an institutional role'
      USING ERRCODE = '23514', CONSTRAINT = 'platform_owner_role_exclusive';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER platform_owner_role_exclusive BEFORE INSERT OR UPDATE ON institution_memberships
FOR EACH ROW WHEN (NEW.status = 'ACTIVE') EXECUTE FUNCTION prevent_owner_membership();
