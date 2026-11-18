import type { Pool, PoolClient } from 'pg';

export type AccessRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'CANCELLED';

export type AccessRequestRole = 'TEACHER' | 'STUDENT';

export type InstitutionSummary = {
  id: string;
  name: string;
  slug: string;
};

export type MyAccessRequest = {
  id: string;
  institution: InstitutionSummary;
  status: AccessRequestStatus;
  requestedRole: AccessRequestRole | null;
  assignedRole: AccessRequestRole | null;
  decisionReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

export type SubmitAccessRequestInput = {
  userId: string;
  institutionId: string;
  requestedRole: AccessRequestRole;
  fullName: string;
  contactEmail: string;
  institutionalEmail: string | null;
  institutionalCode: string | null;
  requestReason: string;
};

export type SubmitAccessRequestResult =
  | { status: 'CREATED'; requestId: string }
  | { status: 'INSTITUTION_NOT_FOUND' }
  | { status: 'ALREADY_MEMBER' }
  | { status: 'PENDING_EXISTS' };

export type CancelAccessRequestResult =
  | { status: 'CANCELLED' }
  | { status: 'NOT_FOUND' }
  | { status: 'ALREADY_DECIDED' };

async function rollback(client: PoolClient) {
  await client.query('ROLLBACK').catch(() => {});
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

export function createInstitutionAccessRepository(pool: Pool) {
  return Object.freeze({
    async searchInstitutions(
      query: string,
    ): Promise<InstitutionSummary[]> {
      try {
        const result = await pool.query<InstitutionSummary>({
          name: 'access-institutions-search',
          text: `
            SELECT id, name, slug
              FROM institutions
             WHERE $1 = ''
                OR name ILIKE '%' || $1 || '%'
                OR slug ILIKE '%' || $1 || '%'
             ORDER BY name
             LIMIT 20
          `,
          values: [escapeLike(query)],
        });

        return result.rows;
      } catch {
        throw new Error('ACCESS_STORAGE_UNAVAILABLE');
      }
    },

    async listMyAccessRequests(
      userId: string,
    ): Promise<MyAccessRequest[]> {
      try {
        const result = await pool.query<{
          request_id: string;
          institution_id: string;
          institution_name: string;
          institution_slug: string;
          status: AccessRequestStatus;
          requested_role: AccessRequestRole | null;
          assigned_role: AccessRequestRole | null;
          decision_reason: string | null;
          created_at: Date;
          decided_at: Date | null;
        }>({
          name: 'access-requests-list-for-user',
          text: `
            SELECT
              r.id AS request_id,
              i.id AS institution_id,
              i.name AS institution_name,
              i.slug AS institution_slug,
              r.status,
              r.requested_role,
              r.assigned_role,
              r.decision_reason,
              r.created_at,
              r.decided_at
            FROM institution_access_requests r
            JOIN institutions i
              ON i.id = r.institution_id
            WHERE r.user_id = $1
            ORDER BY r.created_at DESC
          `,
          values: [userId],
        });

        return result.rows.map(row => ({
          id: row.request_id,
          institution: {
            id: row.institution_id,
            name: row.institution_name,
            slug: row.institution_slug,
          },
          status: row.status,
          requestedRole: row.requested_role,
          assignedRole: row.assigned_role,
          decisionReason: row.decision_reason,
          createdAt: row.created_at,
          decidedAt: row.decided_at,
        }));
      } catch {
        throw new Error('ACCESS_STORAGE_UNAVAILABLE');
      }
    },

    async submitAccessRequest(
      input: SubmitAccessRequestInput,
    ): Promise<SubmitAccessRequestResult> {
      let client: PoolClient | undefined;

      try {
        client = await pool.connect();
        await client.query('BEGIN');

        const institution = await client.query({
          name: 'access-institution-exists',
          text: `SELECT 1 FROM institutions WHERE id = $1`,
          values: [input.institutionId],
        });

        if (institution.rowCount !== 1) {
          await client.query('ROLLBACK');
          return { status: 'INSTITUTION_NOT_FOUND' };
        }

        const membership = await client.query({
          name: 'access-active-membership-exists',
          text: `
            SELECT 1
              FROM institution_memberships
             WHERE user_id = $1
               AND institution_id = $2
               AND status = 'ACTIVE'
             LIMIT 1
          `,
          values: [input.userId, input.institutionId],
        });

        if (membership.rowCount === 1) {
          await client.query('ROLLBACK');
          return { status: 'ALREADY_MEMBER' };
        }

        let requestId: string;

        try {
          const created = await client.query<{ id: string }>({
            name: 'access-request-submit',
            text: `
              INSERT INTO institution_access_requests(
                user_id,
                institution_id,
                requested_role,
                full_name,
                contact_email,
                institutional_email,
                institutional_code,
                request_reason
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              RETURNING id
            `,
            values: [
              input.userId,
              input.institutionId,
              input.requestedRole,
              input.fullName,
              input.contactEmail,
              input.institutionalEmail,
              input.institutionalCode,
              input.requestReason,
            ],
          });

          requestId = created.rows[0]!.id;
        } catch (error) {
          if (isUniqueViolation(error)) {
            await client.query('ROLLBACK');
            return { status: 'PENDING_EXISTS' };
          }

          throw error;
        }

        await client.query({
          name: 'access-request-event-submitted',
          text: `
            INSERT INTO access_request_events(
              request_id,
              actor_user_id,
              action
            )
            VALUES ($1, $2, 'SUBMITTED')
          `,
          values: [requestId, input.userId],
        });

        await client.query('COMMIT');

        return { status: 'CREATED', requestId };
      } catch {
        if (client) {
          await rollback(client);
        }

        throw new Error('ACCESS_STORAGE_UNAVAILABLE');
      } finally {
        client?.release();
      }
    },

    async cancelAccessRequest(
      userId: string,
      requestId: string,
    ): Promise<CancelAccessRequestResult> {
      let client: PoolClient | undefined;

      try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Filtering by owner makes another user's request indistinguishable from a missing one.
        const request = await client.query<{
          status: AccessRequestStatus;
        }>({
          name: 'access-request-lock-for-cancel',
          text: `
            SELECT status
              FROM institution_access_requests
             WHERE id = $1
               AND user_id = $2
             FOR UPDATE
          `,
          values: [requestId, userId],
        });

        if (request.rowCount !== 1) {
          await client.query('ROLLBACK');
          return { status: 'NOT_FOUND' };
        }

        if (request.rows[0]!.status !== 'PENDING') {
          await client.query('ROLLBACK');
          return { status: 'ALREADY_DECIDED' };
        }

        await client.query({
          name: 'access-request-mark-cancelled',
          text: `
            UPDATE institution_access_requests
               SET status = 'CANCELLED',
                   decided_at = now(),
                   updated_at = now()
             WHERE id = $1
          `,
          values: [requestId],
        });

        await client.query({
          name: 'access-request-event-cancelled',
          text: `
            INSERT INTO access_request_events(
              request_id,
              actor_user_id,
              action
            )
            VALUES ($1, $2, 'CANCELLED')
          `,
          values: [requestId, userId],
        });

        await client.query('COMMIT');

        return { status: 'CANCELLED' };
      } catch {
        if (client) {
          await rollback(client);
        }

        throw new Error('ACCESS_STORAGE_UNAVAILABLE');
      } finally {
        client?.release();
      }
    },
  });
}
