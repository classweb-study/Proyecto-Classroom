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
  // The requester's own form data, so a denied request can be corrected and resent.
  fullName: string | null;
  contactEmail: string | null;
  institutionalEmail: string | null;
  institutionalCode: string | null;
  requestReason: string | null;
  hasActiveMembership: boolean;
  messageCount: number;
  createdAt: Date;
  decidedAt: Date | null;
};

export type MyRequestMessage = {
  id: string;
  fromAdmin: boolean;
  body: string;
  createdAt: Date;
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
          full_name: string | null;
          contact_email: string | null;
          institutional_email: string | null;
          institutional_code: string | null;
          request_reason: string | null;
          has_active_membership: boolean;
          message_count: number;
          created_at: Date;
          decided_at: Date | null;
        }>({
          name: 'access-requests-list-for-user-v3',
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
              r.full_name,
              r.contact_email,
              r.institutional_email,
              r.institutional_code,
              r.request_reason,
              EXISTS (
                SELECT 1 FROM institution_memberships m
                 WHERE m.user_id = r.user_id AND m.institution_id = r.institution_id
                   AND m.status = 'ACTIVE'
              ) AS has_active_membership,
              (SELECT count(*)::int FROM access_request_messages m
                WHERE m.request_id = r.id) AS message_count,
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
          fullName: row.full_name,
          contactEmail: row.contact_email,
          institutionalEmail: row.institutional_email,
          institutionalCode: row.institutional_code,
          requestReason: row.request_reason,
          hasActiveMembership: row.has_active_membership,
          messageCount: row.message_count,
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

    async listMyRequestMessages(
      userId: string,
      requestId: string,
    ): Promise<
      | { status: 'OK'; messages: MyRequestMessage[] }
      | { status: 'NOT_FOUND' }
    > {
      try {
        // Filtering by owner hides other people's requests entirely.
        const owned = await pool.query(
          `
            SELECT 1 FROM institution_access_requests
             WHERE id = $1 AND user_id = $2
          `,
          [requestId, userId],
        );

        if (owned.rowCount !== 1) {
          return { status: 'NOT_FOUND' };
        }

        const result = await pool.query<{
          id: string;
          from_admin: boolean;
          body: string;
          created_at: Date;
        }>(
          `
            SELECT id, from_admin, body, created_at
              FROM access_request_messages
             WHERE request_id = $1
             ORDER BY created_at
          `,
          [requestId],
        );

        return {
          status: 'OK',
          messages: result.rows.map(row => ({
            id: row.id,
            fromAdmin: row.from_admin,
            body: row.body,
            createdAt: row.created_at,
          })),
        };
      } catch {
        throw new Error('ACCESS_STORAGE_UNAVAILABLE');
      }
    },

    async postMyRequestMessage(
      userId: string,
      requestId: string,
      body: string,
    ): Promise<{ status: 'OK' } | { status: 'NOT_FOUND' }> {
      try {
        const result = await pool.query(
          `
            INSERT INTO access_request_messages(
              request_id, author_user_id, from_admin, body
            )
            SELECT id, $2, false, $3
              FROM institution_access_requests
             WHERE id = $1 AND user_id = $2
          `,
          [requestId, userId, body],
        );

        return result.rowCount === 1
          ? { status: 'OK' }
          : { status: 'NOT_FOUND' };
      } catch {
        throw new Error('ACCESS_STORAGE_UNAVAILABLE');
      }
    },
  });
}
