import { isRoleConflict } from './role-conflict.js';
import type { Pool, PoolClient } from 'pg';

export type AssignableInstitutionRole =
  | 'TEACHER'
  | 'STUDENT';

export type PendingAccessRequest = {
  id: string;
  userId: string;
  githubLogin: string;
  avatarUrl: string | null;
  institutionId: string;
  institutionName: string;
  requestedRole: AssignableInstitutionRole | null;
  fullName: string | null;
  contactEmail: string | null;
  institutionalEmail: string | null;
  institutionalCode: string | null;
  requestReason: string | null;
  // A matching email domain is only a hint for the reviewer, never proof of membership.
  domainMatch: boolean;
  status: AccessRequestListStatus;
  assignedRole: AssignableInstitutionRole | null;
  decisionReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

export type AccessRequestListStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'CANCELLED';

export type RequestMessage = {
  id: string;
  fromAdmin: boolean;
  // Requesters see "Administración" instead of an individual admin login.
  authorLogin: string | null;
  body: string;
  createdAt: Date;
};

export type PendingAccessRequestsResult =
  | {
      status: 'OK';
      requests: PendingAccessRequest[];
    }
  | {
      status: 'FORBIDDEN';
    };

export type InstitutionMember = {
  membershipId: string;
  userId: string;
  githubLogin: string;
  avatarUrl: string | null;
  role: AssignableInstitutionRole;
  membershipStatus: 'ACTIVE';
  joinedAt: Date;
  institutionalIdentifier: string | null;
  academicIdentityStatus:
    | 'PENDING'
    | 'VERIFIED'
    | 'REJECTED'
    | null;
};

export type InstitutionMembersResult =
  | {
      status: 'OK';
      members: InstitutionMember[];
    }
  | {
      status: 'FORBIDDEN';
    };

export type AccessDecisionResult =
  | {
      status: 'APPROVED';
      githubLogin: string;
      role: AssignableInstitutionRole;
    }
  | {
      status: 'DENIED';
      githubLogin: string;
    }
  | {
      status: 'FORBIDDEN';
    }
  | {
      status: 'NOT_FOUND';
    }
  | {
      status: 'ALREADY_DECIDED';
    };

export type InstitutionDomain = {
  id: string;
  domain: string;
};

export type InstitutionOverview = {
  institution: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    accentColor: string | null;
  };
  domains: InstitutionDomain[];
  counts: {
    teachers: number;
    students: number;
    pendingRequests: number;
    courses: number;
  };
};

export type AuditLogEntry = {
  id: string;
  action: string;
  actorLogin: string | null;
  targetLogin: string | null;
  details: string | null;
  createdAt: Date;
};

type Forbidden = { status: 'FORBIDDEN' };

export type MembershipChangeResult =
  | { status: 'OK' }
  | { status: 'NOT_FOUND' }
  | { status: 'SELF' }
  | { status: 'SAME_ROLE' }
  | Forbidden;

async function rollback(client: PoolClient) {
  await client.query('ROLLBACK').catch(() => {});
}

async function asInstitutionAdmin<T>(
  pool: Pool,
  actorUserId: string,
  institutionId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T | Forbidden> {
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    if (!(await isActiveAdmin(client, actorUserId, institutionId))) {
      await client.query('ROLLBACK');
      return { status: 'FORBIDDEN' };
    }

    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) {
      await rollback(client);
    }

    if (isRoleConflict(error)) throw new Error('ROLE_CONFLICT');
    throw new Error('ADMIN_STORAGE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

async function recordAudit(
  client: PoolClient,
  event: {
    institutionId: string;
    actorUserId: string;
    action:
      | 'MEMBERSHIP_REVOKED'
      | 'MEMBERSHIP_ROLE_CHANGED'
      | 'INSTITUTION_UPDATED'
      | 'DOMAIN_ADDED'
      | 'DOMAIN_REMOVED' | 'APPLICANT_UPDATED' | 'MEMBERSHIP_RESTORED';
    targetUserId?: string;
    details?: string;
  },
) {
  await client.query({
    name: 'admin-audit-event-insert',
    text: `
      INSERT INTO institution_audit_events(
        institution_id,
        actor_user_id,
        action,
        target_user_id,
        details
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    values: [
      event.institutionId,
      event.actorUserId,
      event.action,
      event.targetUserId ?? null,
      event.details ?? null,
    ],
  });
}

async function lockManageableMembership(
  client: PoolClient,
  institutionId: string,
  membershipId: string,
) {
  const result = await client.query<{
    user_id: string;
    role: AssignableInstitutionRole;
  }>({
    name: 'admin-membership-lock',
    text: `
      SELECT user_id, role
        FROM institution_memberships
       WHERE id = $1
         AND institution_id = $2
         AND role IN ('TEACHER', 'STUDENT')
         AND status = 'ACTIVE'
       FOR UPDATE
    `,
    values: [membershipId, institutionId],
  });

  return result.rows[0] ?? null;
}

async function isActiveAdmin(
  client: PoolClient,
  actorUserId: string,
  institutionId: string,
): Promise<boolean> {
  const result = await client.query({
    name: 'admin-active-membership-check',
    text: `
      SELECT 1
        FROM institution_memberships
       WHERE user_id = $1
         AND institution_id = $2
         AND role = 'ADMIN'
         AND status = 'ACTIVE'
       LIMIT 1
    `,
    values: [actorUserId, institutionId],
  });

  return result.rowCount === 1;
}

// Role changes also revoke the previous membership. Offer only the most
// recent role, and only while the person has no active institutional access.
const restorableMemberships = `
  SELECT DISTINCT ON (m.user_id) m.id, m.user_id, m.role, m.updated_at
    FROM institution_memberships m
   WHERE m.institution_id = $1 AND m.role IN ('TEACHER', 'STUDENT')
     AND m.status IN ('REVOKED', 'SUSPENDED')
     AND NOT EXISTS (
       SELECT 1 FROM institution_memberships active
        WHERE active.institution_id = m.institution_id AND active.user_id = m.user_id
          AND active.status = 'ACTIVE'
     )
   ORDER BY m.user_id, m.updated_at DESC, m.id
`;

export function createAdminRepository(pool: Pool) {
  return Object.freeze({
    async listPendingAccessRequests(
      actorUserId: string,
      institutionId: string,
      status: AccessRequestListStatus = 'PENDING',
    ): Promise<PendingAccessRequestsResult> {
      let client: PoolClient | undefined;

      try {
        client = await pool.connect();

        const authorized = await isActiveAdmin(
          client,
          actorUserId,
          institutionId,
        );

        if (!authorized) {
          return { status: 'FORBIDDEN' };
        }

        const result = await client.query<{
          request_id: string;
          user_id: string;
          login: string;
          avatar_url: string | null;
          institution_id: string;
          institution_name: string;
          requested_role: AssignableInstitutionRole | null;
          full_name: string | null;
          contact_email: string | null;
          institutional_email: string | null;
          institutional_code: string | null;
          request_reason: string | null;
          domain_match: boolean;
          status: AccessRequestListStatus;
          assigned_role: AssignableInstitutionRole | null;
          decision_reason: string | null;
          decided_at: Date | null;
          created_at: Date;
        }>({
          name: 'admin-access-requests-list-by-status',
          text: `
            SELECT
              r.id AS request_id,
              r.user_id,
              g.login,
              g.avatar_url,
              i.id AS institution_id,
              i.name AS institution_name,
              r.requested_role,
              r.full_name,
              r.contact_email,
              r.institutional_email,
              r.institutional_code,
              r.request_reason,
              EXISTS (
                SELECT 1
                  FROM institution_domains d
                 WHERE d.institution_id = r.institution_id
                   AND d.domain IN (
                     split_part(r.institutional_email, '@', 2),
                     split_part(r.contact_email, '@', 2)
                   )
              ) AS domain_match,
              r.status,
              r.assigned_role,
              r.decision_reason,
              r.decided_at,
              r.created_at
            FROM institution_access_requests r
            JOIN github_identities g
              ON g.user_id = r.user_id
            JOIN institutions i
              ON i.id = r.institution_id
            WHERE r.institution_id = $1
              AND r.status = $2
            ORDER BY
              CASE WHEN r.status = 'PENDING' THEN r.created_at END ASC,
              r.decided_at DESC
            LIMIT 200
          `,
          values: [institutionId, status],
        });

        return {
          status: 'OK',
          requests: result.rows.map(row => ({
            id: row.request_id,
            userId: row.user_id,
            githubLogin: row.login,
            avatarUrl: row.avatar_url,
            institutionId: row.institution_id,
            institutionName: row.institution_name,
            requestedRole: row.requested_role,
            fullName: row.full_name,
            contactEmail: row.contact_email,
            institutionalEmail: row.institutional_email,
            institutionalCode: row.institutional_code,
            requestReason: row.request_reason,
            domainMatch: row.domain_match,
            status: row.status,
            assignedRole: row.assigned_role,
            decisionReason: row.decision_reason,
            decidedAt: row.decided_at,
            createdAt: row.created_at,
          })),
        };
      } catch {
        throw new Error('ADMIN_STORAGE_UNAVAILABLE');
      } finally {
        client?.release();
      }
    },

    async listInstitutionMembers(
      actorUserId: string,
      institutionId: string,
      role: AssignableInstitutionRole,
    ): Promise<InstitutionMembersResult> {
      let client: PoolClient | undefined;

      try {
        client = await pool.connect();

        const authorized = await isActiveAdmin(
          client,
          actorUserId,
          institutionId,
        );

        if (!authorized) {
          return { status: 'FORBIDDEN' };
        }

        const result = await client.query<{
          membership_id: string;
          user_id: string;
          login: string;
          avatar_url: string | null;
          role: AssignableInstitutionRole;
          created_at: Date;
          institutional_identifier: string | null;
          academic_identity_status:
            | 'PENDING'
            | 'VERIFIED'
            | 'REJECTED'
            | null;
        }>({
          name: 'admin-institution-members-by-role',
          text: `
            SELECT
              m.id AS membership_id,
              m.user_id,
              g.login,
              g.avatar_url,
              m.role,
              m.created_at,
              a.institutional_identifier,
              a.status AS academic_identity_status
            FROM institution_memberships m
            JOIN github_identities g
              ON g.user_id = m.user_id
            LEFT JOIN academic_identities a
              ON a.user_id = m.user_id
             AND a.institution_id = m.institution_id
            WHERE m.institution_id = $1
              AND m.role = $2
              AND m.status = 'ACTIVE'
            ORDER BY m.created_at ASC
          `,
          values: [
            institutionId,
            role,
          ],
        });

        return {
          status: 'OK',
          members: result.rows.map(row => ({
            membershipId: row.membership_id,
            userId: row.user_id,
            githubLogin: row.login,
            avatarUrl: row.avatar_url,
            role: row.role,
            membershipStatus: 'ACTIVE',
            joinedAt: row.created_at,
            institutionalIdentifier:
              row.institutional_identifier,
            academicIdentityStatus:
              row.academic_identity_status,
          })),
        };
      } catch {
        throw new Error('ADMIN_STORAGE_UNAVAILABLE');
      } finally {
        client?.release();
      }
    },

    updateApplicant(input: {
      actorUserId: string;
      institutionId: string;
      requestId: string;
      fullName: string;
      contactEmail: string;
      institutionalCode: string;
    }) {
      return asInstitutionAdmin(pool, input.actorUserId, input.institutionId, async client => {
        const result = await client.query(
          `UPDATE institution_access_requests
              SET full_name = $3, contact_email = $4, institutional_code = $5, updated_at = now()
            WHERE id = $1 AND institution_id = $2 AND status = 'PENDING' RETURNING user_id`,
          [input.requestId, input.institutionId, input.fullName, input.contactEmail, input.institutionalCode],
        );
        if (result.rowCount) await recordAudit(client, {institutionId: input.institutionId, actorUserId: input.actorUserId, action: 'APPLICANT_UPDATED', targetUserId: result.rows[0].user_id});
        return result.rowCount === 1 ? { status: 'OK' } as const : { status: 'NOT_FOUND' } as const;
      });
    },

    async approveAccessRequest(input: {
      actorUserId: string;
      institutionId: string;
      requestId: string;
      role: AssignableInstitutionRole;
    }): Promise<AccessDecisionResult> {
      let client: PoolClient | undefined;

      try {
        client = await pool.connect();
        await client.query('BEGIN');

        const authorized = await isActiveAdmin(
          client,
          input.actorUserId,
          input.institutionId,
        );

        if (!authorized) {
          await client.query('ROLLBACK');
          return { status: 'FORBIDDEN' };
        }

        const request = await client.query<{
          user_id: string;
          login: string;
          status: 'PENDING' | 'APPROVED' | 'DENIED';
        }>({
          name: 'admin-access-request-lock-for-approve',
          text: `
            SELECT
              r.user_id,
              g.login,
              r.status
            FROM institution_access_requests r
            JOIN github_identities g
              ON g.user_id = r.user_id
            WHERE r.id = $1
              AND r.institution_id = $2
            FOR UPDATE OF r
          `,
          values: [
            input.requestId,
            input.institutionId,
          ],
        });

        if (request.rowCount !== 1) {
          await client.query('ROLLBACK');
          return { status: 'NOT_FOUND' };
        }

        const row = request.rows[0]!;

        if (row.status !== 'PENDING') {
          await client.query('ROLLBACK');
          return { status: 'ALREADY_DECIDED' };
        }

        await client.query({
          name: 'admin-membership-create-after-approval',
          text: `
            INSERT INTO institution_memberships(
              user_id,
              institution_id,
              role
            )
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, institution_id, role)
            DO UPDATE SET status = 'ACTIVE', updated_at = now()
          `,
          values: [
            row.user_id,
            input.institutionId,
            input.role,
          ],
        });

        await client.query({
          name: 'admin-access-request-mark-approved',
          text: `
            UPDATE institution_access_requests
               SET status = 'APPROVED',
                   assigned_role = $2,
                   decided_by_user_id = $3,
                   decided_at = now(),
                   updated_at = now()
             WHERE id = $1
          `,
          values: [
            input.requestId,
            input.role,
            input.actorUserId,
          ],
        });

        await client.query({
          name: 'admin-access-request-event-approved',
          text: `
            INSERT INTO access_request_events(
              request_id,
              actor_user_id,
              action
            )
            VALUES ($1, $2, 'APPROVED')
          `,
          values: [input.requestId, input.actorUserId],
        });

        await client.query('COMMIT');

        return {
          status: 'APPROVED',
          githubLogin: row.login,
          role: input.role,
        };
      } catch (error) {
        if (client) {
          await rollback(client);
        }

        if (isRoleConflict(error)) throw new Error('ROLE_CONFLICT');
        throw new Error('ADMIN_STORAGE_UNAVAILABLE');
      } finally {
        client?.release();
      }
    },

    async denyAccessRequest(input: {
      actorUserId: string;
      institutionId: string;
      requestId: string;
      reason: string;
    }): Promise<AccessDecisionResult> {
      let client: PoolClient | undefined;

      try {
        client = await pool.connect();
        await client.query('BEGIN');

        const authorized = await isActiveAdmin(
          client,
          input.actorUserId,
          input.institutionId,
        );

        if (!authorized) {
          await client.query('ROLLBACK');
          return { status: 'FORBIDDEN' };
        }

        const request = await client.query<{
          login: string;
          status: 'PENDING' | 'APPROVED' | 'DENIED';
        }>({
          name: 'admin-access-request-lock-for-deny',
          text: `
            SELECT
              g.login,
              r.status
            FROM institution_access_requests r
            JOIN github_identities g
              ON g.user_id = r.user_id
            WHERE r.id = $1
              AND r.institution_id = $2
            FOR UPDATE OF r
          `,
          values: [
            input.requestId,
            input.institutionId,
          ],
        });

        if (request.rowCount !== 1) {
          await client.query('ROLLBACK');
          return { status: 'NOT_FOUND' };
        }

        const row = request.rows[0]!;

        if (row.status !== 'PENDING') {
          await client.query('ROLLBACK');
          return { status: 'ALREADY_DECIDED' };
        }

        await client.query({
          name: 'admin-access-request-mark-denied',
          text: `
            UPDATE institution_access_requests
               SET status = 'DENIED',
                   assigned_role = NULL,
                   decided_by_user_id = $2,
                   decision_reason = $3,
                   decided_at = now(),
                   updated_at = now()
             WHERE id = $1
          `,
          values: [
            input.requestId,
            input.actorUserId,
            input.reason,
          ],
        });

        await client.query({
          name: 'admin-access-request-event-denied',
          text: `
            INSERT INTO access_request_events(
              request_id,
              actor_user_id,
              action,
              reason
            )
            VALUES ($1, $2, 'DENIED', $3)
          `,
          values: [
            input.requestId,
            input.actorUserId,
            input.reason,
          ],
        });

        await client.query('COMMIT');

        return {
          status: 'DENIED',
          githubLogin: row.login,
        };
      } catch {
        if (client) {
          await rollback(client);
        }

        throw new Error('ADMIN_STORAGE_UNAVAILABLE');
      } finally {
        client?.release();
      }
    },

    getInstitutionOverview(
      actorUserId: string,
      institutionId: string,
    ) {
      return asInstitutionAdmin(
        pool,
        actorUserId,
        institutionId,
        async (client): Promise<{ status: 'OK' } & InstitutionOverview> => {
          const institution = await client.query<{
            id: string;
            name: string;
            slug: string;
            description: string | null;
            logo_url: string | null;
            accent_color: string | null;
            teachers: number;
            students: number;
            pending_requests: number;
            courses: number;
          }>({
            name: 'admin-institution-overview-v2',
            text: `
              SELECT
                i.id,
                i.name,
                i.slug,
                i.description,
                i.logo_url,
                i.accent_color,
                (SELECT count(*)::int FROM courses
                  WHERE institution_id = i.id AND status = 'ACTIVE') AS courses,
                (SELECT count(*)::int FROM institution_memberships
                  WHERE institution_id = i.id AND role = 'TEACHER' AND status = 'ACTIVE') AS teachers,
                (SELECT count(*)::int FROM institution_memberships
                  WHERE institution_id = i.id AND role = 'STUDENT' AND status = 'ACTIVE') AS students,
                (SELECT count(*)::int FROM institution_access_requests
                  WHERE institution_id = i.id AND status = 'PENDING') AS pending_requests
              FROM institutions i
              WHERE i.id = $1
            `,
            values: [institutionId],
          });

          const domains = await client.query<InstitutionDomain>({
            name: 'admin-institution-domains-list',
            text: `
              SELECT id, domain
                FROM institution_domains
               WHERE institution_id = $1
               ORDER BY domain
            `,
            values: [institutionId],
          });

          const row = institution.rows[0]!;

          return {
            status: 'OK',
            institution: {
              id: row.id,
              name: row.name,
              slug: row.slug,
              description: row.description,
              logoUrl: row.logo_url,
              accentColor: row.accent_color,
            },
            domains: domains.rows,
            counts: {
              teachers: row.teachers,
              students: row.students,
              pendingRequests: row.pending_requests,
              courses: row.courses,
            },
          };
        },
      );
    },

    updateInstitution(input: {
      actorUserId: string;
      institutionId: string;
      name: string;
      description: string | null;
      logoUrl: string | null;
      accentColor: string | null;
    }) {
      return asInstitutionAdmin(
        pool,
        input.actorUserId,
        input.institutionId,
        async (client): Promise<{ status: 'OK' }> => {
          await client.query({
            name: 'admin-institution-update-v2',
            text: `
              UPDATE institutions
                 SET name = $2,
                     description = $3,
                     logo_url = $4,
                     accent_color = $5,
                     updated_at = now()
               WHERE id = $1
            `,
            values: [
              input.institutionId,
              input.name,
              input.description,
              input.logoUrl,
              input.accentColor,
            ],
          });

          await recordAudit(client, {
            institutionId: input.institutionId,
            actorUserId: input.actorUserId,
            action: 'INSTITUTION_UPDATED',
          });

          return { status: 'OK' };
        },
      );
    },

    addInstitutionDomain(input: {
      actorUserId: string;
      institutionId: string;
      domain: string;
    }) {
      return asInstitutionAdmin(
        pool,
        input.actorUserId,
        input.institutionId,
        async (
          client,
        ): Promise<
          | { status: 'OK'; domain: InstitutionDomain }
          | { status: 'DUPLICATE' }
        > => {
          const created = await client.query<InstitutionDomain>({
            name: 'admin-institution-domain-add',
            text: `
              INSERT INTO institution_domains(institution_id, domain)
              VALUES ($1, $2)
              ON CONFLICT (institution_id, domain) DO NOTHING
              RETURNING id, domain
            `,
            values: [input.institutionId, input.domain],
          });

          if (created.rowCount !== 1) {
            return { status: 'DUPLICATE' };
          }

          await recordAudit(client, {
            institutionId: input.institutionId,
            actorUserId: input.actorUserId,
            action: 'DOMAIN_ADDED',
            details: input.domain,
          });

          return { status: 'OK', domain: created.rows[0]! };
        },
      );
    },

    removeInstitutionDomain(input: {
      actorUserId: string;
      institutionId: string;
      domainId: string;
    }) {
      return asInstitutionAdmin(
        pool,
        input.actorUserId,
        input.institutionId,
        async (
          client,
        ): Promise<{ status: 'OK' } | { status: 'NOT_FOUND' }> => {
          const removed = await client.query<{ domain: string }>({
            name: 'admin-institution-domain-remove',
            text: `
              DELETE FROM institution_domains
               WHERE id = $1
                 AND institution_id = $2
              RETURNING domain
            `,
            values: [input.domainId, input.institutionId],
          });

          if (removed.rowCount !== 1) {
            return { status: 'NOT_FOUND' };
          }

          await recordAudit(client, {
            institutionId: input.institutionId,
            actorUserId: input.actorUserId,
            action: 'DOMAIN_REMOVED',
            details: removed.rows[0]!.domain,
          });

          return { status: 'OK' };
        },
      );
    },

    listRemovedMembers(actor: string, institution: string) {
      return asInstitutionAdmin(pool, actor, institution, async client => {
        const result = await client.query<{ id: string; login: string; role: AssignableInstitutionRole; pending: boolean }>(
          `SELECT m.id, g.login, m.role, EXISTS (
              SELECT 1 FROM institution_access_requests r
               WHERE r.institution_id = $1 AND r.user_id = m.user_id AND r.status = 'PENDING'
           ) AS pending
             FROM (${restorableMemberships}) m JOIN github_identities g ON g.user_id = m.user_id
            ORDER BY g.login`, [institution],
        );
        return { status: 'OK' as const, members: result.rows };
      });
    },

    restoreMembership(actor: string, institution: string, membership: string) {
      return asInstitutionAdmin(pool, actor, institution, async client => {
        const locked = await client.query(
          `SELECT u.id FROM users u JOIN institution_memberships m ON m.user_id = u.id
            WHERE m.institution_id = $1 AND m.id = $2 AND m.role IN ('TEACHER','STUDENT')
            FOR UPDATE OF u`, [institution, membership],
        );
        if (!locked.rowCount) return { status: 'NOT_FOUND' as const };
        const restored = await client.query(
          `UPDATE institution_memberships m SET status = 'ACTIVE', updated_at = now()
            WHERE m.id = $2 AND m.id IN (SELECT id FROM (${restorableMemberships}) eligible)
              AND NOT EXISTS (SELECT 1 FROM institution_access_requests r WHERE r.institution_id = $1
                               AND r.user_id = m.user_id AND r.status = 'PENDING')
            RETURNING m.user_id`, [institution, membership],
        );
        if (restored.rowCount) await recordAudit(client, {institutionId: institution, actorUserId: actor, action: 'MEMBERSHIP_RESTORED', targetUserId: restored.rows[0].user_id});
        return restored.rowCount ? { status: 'OK' as const } : { status: 'STALE_MEMBERSHIP' as const };
      });
    },

    revokeMembership(input: {
      actorUserId: string;
      institutionId: string;
      membershipId: string;
    }) {
      return asInstitutionAdmin(
        pool,
        input.actorUserId,
        input.institutionId,
        async (client): Promise<MembershipChangeResult> => {
          const membership = await lockManageableMembership(
            client,
            input.institutionId,
            input.membershipId,
          );

          if (!membership) {
            return { status: 'NOT_FOUND' };
          }

          if (membership.user_id === input.actorUserId) {
            return { status: 'SELF' };
          }

          await client.query({
            name: 'admin-membership-revoke',
            text: `
              UPDATE institution_memberships
                 SET status = 'REVOKED',
                     updated_at = now()
               WHERE id = $1
            `,
            values: [input.membershipId],
          });

          await recordAudit(client, {
            institutionId: input.institutionId,
            actorUserId: input.actorUserId,
            action: 'MEMBERSHIP_REVOKED',
            targetUserId: membership.user_id,
            details: membership.role,
          });

          return { status: 'OK' };
        },
      );
    },

    changeMembershipRole(input: {
      actorUserId: string;
      institutionId: string;
      membershipId: string;
      role: AssignableInstitutionRole;
    }) {
      return asInstitutionAdmin(
        pool,
        input.actorUserId,
        input.institutionId,
        async (client): Promise<MembershipChangeResult> => {
          const membership = await lockManageableMembership(
            client,
            input.institutionId,
            input.membershipId,
          );

          if (!membership) {
            return { status: 'NOT_FOUND' };
          }

          if (membership.user_id === input.actorUserId) {
            return { status: 'SELF' };
          }

          if (membership.role === input.role) {
            return { status: 'SAME_ROLE' };
          }

          await client.query({
            name: 'admin-membership-revoke-for-role-change',
            text: `
              UPDATE institution_memberships
                 SET status = 'REVOKED',
                     updated_at = now()
               WHERE id = $1
            `,
            values: [input.membershipId],
          });

          await client.query({
            name: 'admin-membership-activate-new-role',
            text: `
              INSERT INTO institution_memberships(
                user_id,
                institution_id,
                role
              )
              VALUES ($1, $2, $3)
              ON CONFLICT (user_id, institution_id, role)
              DO UPDATE SET status = 'ACTIVE', updated_at = now()
            `,
            values: [
              membership.user_id,
              input.institutionId,
              input.role,
            ],
          });

          await recordAudit(client, {
            institutionId: input.institutionId,
            actorUserId: input.actorUserId,
            action: 'MEMBERSHIP_ROLE_CHANGED',
            targetUserId: membership.user_id,
            details: `${membership.role}->${input.role}`,
          });

          return { status: 'OK' };
        },
      );
    },

    listAuditLog(actorUserId: string, institutionId: string) {
      return asInstitutionAdmin(
        pool,
        actorUserId,
        institutionId,
        async (
          client,
        ): Promise<{ status: 'OK'; entries: AuditLogEntry[] }> => {
          const result = await client.query<{
            id: string;
            action: string;
            actor_login: string | null;
            target_login: string | null;
            details: string | null;
            created_at: Date;
          }>({
            name: 'admin-audit-log-list',
            text: `
              SELECT e.id, e.action::text, ga.login AS actor_login,
                     gt.login AS target_login, e.details, e.created_at
                FROM institution_audit_events e
                LEFT JOIN github_identities ga ON ga.user_id = e.actor_user_id
                LEFT JOIN github_identities gt ON gt.user_id = e.target_user_id
               WHERE e.institution_id = $1
              UNION ALL
              SELECT ev.id, 'REQUEST_' || ev.action::text, ga.login,
                     gt.login, ev.reason, ev.created_at
                FROM access_request_events ev
                JOIN institution_access_requests r ON r.id = ev.request_id
                LEFT JOIN github_identities ga ON ga.user_id = ev.actor_user_id
                LEFT JOIN github_identities gt ON gt.user_id = r.user_id
               WHERE r.institution_id = $1
              ORDER BY created_at DESC
              LIMIT 50
            `,
            values: [institutionId],
          });

          return {
            status: 'OK',
            entries: result.rows.map(row => ({
              id: row.id,
              action: row.action,
              actorLogin: row.actor_login,
              targetLogin: row.target_login,
              details: row.details,
              createdAt: row.created_at,
            })),
          };
        },
      );
    },

    listRequestMessages(input: {
      actorUserId: string;
      institutionId: string;
      requestId: string;
    }) {
      return asInstitutionAdmin(
        pool,
        input.actorUserId,
        input.institutionId,
        async (
          client,
        ): Promise<
          | { status: 'OK'; messages: RequestMessage[] }
          | { status: 'NOT_FOUND' }
        > => {
          const request = await client.query(
            `
              SELECT 1 FROM institution_access_requests
               WHERE id = $1 AND institution_id = $2
            `,
            [input.requestId, input.institutionId],
          );

          if (request.rowCount !== 1) {
            return { status: 'NOT_FOUND' };
          }

          const result = await client.query<{
            id: string;
            from_admin: boolean;
            login: string | null;
            body: string;
            created_at: Date;
          }>(
            `
              SELECT m.id, m.from_admin, g.login, m.body, m.created_at
                FROM access_request_messages m
                LEFT JOIN github_identities g ON g.user_id = m.author_user_id
               WHERE m.request_id = $1
               ORDER BY m.created_at
            `,
            [input.requestId],
          );

          return {
            status: 'OK',
            messages: result.rows.map(row => ({
              id: row.id,
              fromAdmin: row.from_admin,
              authorLogin: row.login,
              body: row.body,
              createdAt: row.created_at,
            })),
          };
        },
      );
    },

    postRequestMessage(input: {
      actorUserId: string;
      institutionId: string;
      requestId: string;
      body: string;
    }) {
      return asInstitutionAdmin(
        pool,
        input.actorUserId,
        input.institutionId,
        async (
          client,
        ): Promise<{ status: 'OK' } | { status: 'NOT_FOUND' }> => {
          const request = await client.query(
            `
              SELECT 1 FROM institution_access_requests
               WHERE id = $1 AND institution_id = $2
            `,
            [input.requestId, input.institutionId],
          );

          if (request.rowCount !== 1) {
            return { status: 'NOT_FOUND' };
          }

          await client.query(
            `
              INSERT INTO access_request_messages(
                request_id, author_user_id, from_admin, body
              )
              VALUES ($1, $2, true, $3)
            `,
            [input.requestId, input.actorUserId, input.body],
          );

          return { status: 'OK' };
        },
      );
    },
  });
}
