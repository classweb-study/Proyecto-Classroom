// PostgreSQL reports the constraint name on both exclusion and check violations.
export function isRoleConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('constraint' in error)) return false;
  return error.constraint === 'active_account_role_exclusive' ||
    error.constraint === 'platform_owner_role_exclusive';
}
