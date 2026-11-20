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
  | { status: 'DUPLICATE' }
  | { status: 'USER_NOT_FOUND' };

export type AssignAdminResult =
  | { status: 'OK' }
  | { status: 'NOT_FOUND' }
  | { status: 'USER_NOT_FOUND' };

async function rollback(client: PoolClient) {
  await client.query('ROLLBACK').catch(() => {});
}

async function findUserByLogin(client: PoolClient, login: string) {
  const result = await client.query<{ user_id: string }>(
    `SELECT user_id FROM github_identities WHERE lower(login) = lower($1)`,
    [login],
  );

  return result.rows[0]?.user_id ?? null;
}

async function grantAdmin(
  client: PoolClient,
  input: {
    actorUserId: string;
    institutionId: string;
    userId: string;
    action: 'INSTITUTION_CREATED' | 'MEMBERSHIP_ROLE_CHANGED';
    details: string;
  },
) {
  await client.query(
    `
      INSERT INTO institution_memberships(user_id, institution_id, role)
      VALUES ($1, $2, 'ADMIN')
      ON CONFLICT (user_id, institution_id, role)
      DO UPDATE SET status = 'ACTIVE', updated_at = now()
    `,
    [input.userId, input.institutionId],
  );

  await client.query(
    `
      INSERT INTO institution_audit_events(
        institution_id, actor_user_id, action, target_user_id, details
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      input.institutionId,
      input.actorUserId,
      input.action,
      input.userId,
      input.details,
    ],
  );
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
  } catch {
    if (client) {
      await rollback(client);
    }

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
      firstAdminLogin: string;
    }): Promise<CreateInstitutionResult> {
      return transaction(pool, async client => {
        const adminUserId = await findUserByLogin(
          client,
          input.firstAdminLogin,
        );

        // The first admin must have signed in once so their GitHub id is known.
        if (!adminUserId) {
          return { status: 'USER_NOT_FOUND' as const };
        }

        const created = await client.query<{ id: string }>(
          `
            INSERT INTO institutions(name, slug)
            VALUES ($1, $2)
            ON CONFLICT (slug) DO NOTHING
            RETURNING id
          `,
          [input.name, input.slug],
        );

        const institutionId = created.rows[0]?.id;

        if (!institutionId) {
          return { status: 'DUPLICATE' as const };
        }

        await grantAdmin(client, {
          actorUserId: input.actorUserId,
          institutionId,
          userId: adminUserId,
          action: 'INSTITUTION_CREATED',
          details: `ADMIN:${input.firstAdminLogin}`,
        });

        return { status: 'OK' as const, institutionId };
      });
    },

    async assignInstitutionAdmin(input: {
      actorUserId: string;
      institutionId: string;
      adminLogin: string;
    }): Promise<AssignAdminResult> {
      return transaction(pool, async client => {
        const institution = await client.query(
          `SELECT 1 FROM institutions WHERE id = $1 FOR UPDATE`,
          [input.institutionId],
        );

        if (institution.rowCount !== 1) {
          return { status: 'NOT_FOUND' as const };
        }

        const userId = await findUserByLogin(client, input.adminLogin);

        if (!userId) {
          return { status: 'USER_NOT_FOUND' as const };
        }

        await grantAdmin(client, {
          actorUserId: input.actorUserId,
          institutionId: input.institutionId,
          userId,
          action: 'MEMBERSHIP_ROLE_CHANGED',
          details: '->ADMIN',
        });

        return { status: 'OK' as const };
      });
    },
  });
}
