import { isRoleConflict } from './role-conflict.js';
import type { Pool, PoolClient } from 'pg';

/*
 * Platform administration: creating institutions and naming their admins.
 *
 * Who counts as a platform admin is decided outside the database (an
 * explicit allowlist of GitHub user ids in the deployment environment), so
 * nobody can grant themselves this power through the product. These methods
 * assume the caller has already been checked against that allowlist.
 */

export type PlatformInstitution = {
  id: string;
  name: string;
  slug: string;
  admins: string[];
  members: number;
  createdAt: Date;
};

export type CreateInstitutionResult =
  | { status: 'OK'; institutionId: string }
  | { status: 'DUPLICATE' };

async function rollback(client: PoolClient) {
  await client.query('ROLLBACK').catch(() => {});
}

async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) {
      await rollback(client);
    }

    if (isRoleConflict(error)) throw new Error('ROLE_CONFLICT');
    throw new Error('PLATFORM_STORAGE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

export function createPlatformRepository(pool: Pool) {
  return Object.freeze({
    async listInstitutions(): Promise<PlatformInstitution[]> {
      return transaction(pool, async client => {
        const result = await client.query<{
          id: string;
          name: string;
          slug: string;
          admins: string[] | null;
          members: number;
          created_at: Date;
        }>(
          `
            SELECT i.id, i.name, i.slug, i.created_at,
                   (SELECT array_agg(g.login ORDER BY g.login)
                      FROM institution_memberships m
                      JOIN github_identities g ON g.user_id = m.user_id
                     WHERE m.institution_id = i.id
                       AND m.role = 'ADMIN'
                       AND m.status = 'ACTIVE') AS admins,
                   (SELECT count(DISTINCT m.user_id)::int
                      FROM institution_memberships m
                     WHERE m.institution_id = i.id
                       AND m.status = 'ACTIVE') AS members
              FROM institutions i
             ORDER BY i.name
          `,
        );

        return result.rows.map(row => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          admins: row.admins ?? [],
          members: row.members,
          createdAt: row.created_at,
        }));
      });
    },

    async createInstitution(input: {
      actorUserId: string;
      name: string;
      slug: string;
    }): Promise<CreateInstitutionResult> {
      return transaction(pool, async client => {
        const created = await client.query<{id: string}>(
          'INSERT INTO institutions(name, slug) VALUES ($1,$2) ON CONFLICT (slug) DO NOTHING RETURNING id',
          [input.name, input.slug],
        );
        const institutionId = created.rows[0]?.id;
        if (!institutionId) return {status: 'DUPLICATE'};
        await client.query(
          "INSERT INTO institution_audit_events(institution_id,actor_user_id,action) VALUES ($1,$2,'INSTITUTION_CREATED')",
          [institutionId, input.actorUserId],
        );
        return {status: 'OK', institutionId};
      });
    },

    async requestAdmin(userId: string, institutionId: string) {
      const result = await pool.query(
        `INSERT INTO institution_admin_requests(user_id,institution_id)
         SELECT $1,i.id FROM institutions i WHERE i.id=$2 AND NOT EXISTS (
           SELECT 1 FROM institution_memberships WHERE institution_id=i.id AND user_id=$1 AND role='ADMIN' AND status='ACTIVE'
         ) ON CONFLICT DO NOTHING RETURNING id`, [userId, institutionId],
      );
      return result.rowCount === 1;
    },

    async listRequests(userId: string | null) {
      const result = await pool.query(
        `SELECT r.id, i.name AS institution, g.login, r.status, r.created_at AS "createdAt"
         FROM institution_admin_requests r JOIN institutions i ON i.id=r.institution_id
         JOIN github_identities g ON g.user_id=r.user_id
         WHERE ($1::uuid IS NULL AND r.status='PENDING') OR r.user_id=$1
         ORDER BY r.created_at DESC, r.id`, [userId],
      );
      return result.rows;
    },

    async decideRequest(actor: string, id: string, approve: boolean) {
      return transaction(pool, async client => {
        const decision = await client.query(
          `UPDATE institution_admin_requests SET status=$1, decided_at=now(), decided_by=$2
           WHERE id=$3 AND status='PENDING' RETURNING institution_id,user_id`,
          [approve ? 'APPROVED' : 'DENIED', actor, id],
        );
        const row = decision.rows[0];
        if (!row) return false;
        if (approve) {
          // Approval by the owner replaces the local academic role atomically.
          await client.query(
            `UPDATE institution_memberships SET status='REVOKED', updated_at=now()
              WHERE institution_id=$1 AND user_id=$2 AND status='ACTIVE' AND role<>'ADMIN'`,
            [row.institution_id, row.user_id],
          );
          await client.query(
            `INSERT INTO institution_memberships(institution_id,user_id,role) VALUES ($1,$2,'ADMIN')
             ON CONFLICT (user_id,institution_id,role) DO UPDATE SET status='ACTIVE',updated_at=now()`,
            [row.institution_id,row.user_id],
          );
        }
        return true;
      });
    },

    async listAdminHistory() {
      const result = await pool.query(
        `WITH events AS (
           SELECT id, institution_id, actor_user_id, target_user_id, action::text, details, created_at
           FROM institution_audit_events
           UNION ALL
           SELECT e.id,r.institution_id,e.actor_user_id,r.user_id,'REQUEST_'||e.action::text,e.reason,e.created_at
           FROM access_request_events e JOIN institution_access_requests r ON r.id=e.request_id
           WHERE e.action IN ('APPROVED','DENIED')
           UNION ALL
           SELECT m.id,r.institution_id,m.author_user_id,r.user_id,'MESSAGE_SENT',NULL,m.created_at
           FROM access_request_messages m JOIN institution_access_requests r ON r.id=m.request_id WHERE m.from_admin
         )
         SELECT e.id,i.name AS institution,g.login AS "actorLogin",t.login AS "targetLogin",e.action,e.details,e.created_at AS "createdAt"
         FROM events e JOIN institutions i ON i.id=e.institution_id
         JOIN github_identities g ON g.user_id=e.actor_user_id
         LEFT JOIN github_identities t ON t.user_id=e.target_user_id
         WHERE e.action <> 'INSTITUTION_CREATED'
         ORDER BY e.created_at DESC,e.id`,
      );
      return result.rows;
    },
  });
}
