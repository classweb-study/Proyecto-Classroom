import { randomInt, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

/*
 * Academic flows: profile, courses, enrollments, activities and submissions.
 *
 * Every permission is derived from the database on each call. A course role
 * only counts while the matching institution membership is still ACTIVE, so
 * revoking someone at the institution level immediately removes their course
 * powers too. Course resources the caller cannot see are reported as
 * NOT_FOUND so their existence does not leak across institutions.
 */

export type CourseRole = 'TEACHER' | 'STUDENT';
export type CourseStatus = 'ACTIVE' | 'ARCHIVED';
export type ActivityStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ActivityKind = 'REPOSITORY' | 'LINK' | 'TEXT';
export type SubmissionState =
  | 'MISSING'
  | 'SUBMITTED'
  | 'LATE'
  | 'REVIEWED';

type Fail<S extends string> = { status: S };
type Ok<T> = { status: 'OK' } & T;

export type UserProfile = {
  displayName: string | null;
  contactEmail: string | null;
  notifyDeadlines: boolean;
  notifyFeedback: boolean;
};

export type CourseSummary = {
  id: string;
  institutionId: string;
  name: string;
  code: string | null;
  description: string | null;
  status: CourseStatus;
  viewerRole: CourseRole;
  studentCount: number;
  activityCount: number;
  createdAt: Date;
};

export type CourseDetail = CourseSummary & {
  // Only present for teachers of the course.
  joinCode: string | null;
  joinEnabled: boolean;
};

export type CourseMember = {
  memberId: string;
  userId: string;
  githubLogin: string;
  avatarUrl: string | null;
  displayName: string | null;
  role: CourseRole;
  groupName: string | null;
  joinedAt: Date;
};

export type CourseCandidate = {
  userId: string;
  githubLogin: string;
  displayName: string | null;
};

export type ActivityInput = {
  title: string;
  instructions: string;
  rubric: string | null;
  kind: ActivityKind;
  templateRepoUrl: string | null;
  resourceUrl: string | null;
  maxScore: number | null;
  dueAt: Date | null;
  allowLate: boolean;
  status: ActivityStatus;
};

export type Activity = ActivityInput & {
  id: string;
  courseId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type StudentActivity = Activity & {
  myState: SubmissionState;
  myScore: number | null;
};

export type Submission = {
  id: string;
  attempt: number;
  contentUrl: string | null;
  commitSha: string | null;
  textContent: string | null;
  isLate: boolean;
  feedback: string | null;
  score: number | null;
  reviewedAt: Date | null;
  submittedAt: Date;
};

export type StudentSubmissionStatus = {
  userId: string;
  githubLogin: string;
  displayName: string | null;
  groupName: string | null;
  state: SubmissionState;
  attempts: number;
  latest: Submission | null;
};

export type SubmissionInput = {
  contentUrl: string | null;
  commitSha: string | null;
  textContent: string | null;
};

export type DashboardActivity = {
  activityId: string;
  courseId: string;
  courseName: string;
  title: string;
  dueAt: Date | null;
};

export type StudentDashboard = {
  courses: CourseSummary[];
  upcoming: DashboardActivity[];
  overdue: DashboardActivity[];
  recentFeedback: Array<
    DashboardActivity & {
      score: number | null;
      maxScore: number | null;
      reviewedAt: Date;
    }
  >;
};

export type TeacherDashboard = {
  courses: CourseSummary[];
  toReview: Array<DashboardActivity & { pending: number }>;
  upcoming: DashboardActivity[];
  missingAfterDue: Array<DashboardActivity & { missing: number }>;
};

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newJoinCode(): string {
  let code = '';

  for (let index = 0; index < 8; index += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }

  return code;
}

const GITHUB_REPO_URL =
  /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}(\.git)?\/?$/;

function toNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

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
  } catch {
    if (client) {
      await rollback(client);
    }

    throw new Error('ACADEMIC_STORAGE_UNAVAILABLE');
  } finally {
    client?.release();
  }
}

async function hasInstitutionRole(
  client: PoolClient,
  userId: string,
  institutionId: string,
  role: CourseRole,
) {
  const result = await client.query(
    `
      SELECT 1
        FROM institution_memberships
       WHERE user_id = $1
         AND institution_id = $2
         AND role = $3
         AND status = 'ACTIVE'
    `,
    [userId, institutionId, role],
  );

  return result.rowCount === 1;
}

type CourseAccess = {
  courseId: string;
  institutionId: string;
  courseStatus: CourseStatus;
  role: CourseRole;
};

async function courseAccess(
  client: PoolClient,
  userId: string,
  courseId: string,
  lock: '' | 'FOR UPDATE OF c' | 'FOR SHARE OF c' = '',
): Promise<CourseAccess | null> {
  const result = await client.query<{
    institution_id: string;
    status: CourseStatus;
    role: CourseRole;
  }>(
    `
      SELECT c.institution_id, c.status, cm.role
        FROM courses c
        JOIN course_members cm
          ON cm.course_id = c.id
         AND cm.user_id = $2
         AND cm.status = 'ACTIVE'
        JOIN institution_memberships im
          ON im.institution_id = c.institution_id
         AND im.user_id = $2
         AND im.status = 'ACTIVE'
         AND im.role::text = cm.role::text
       WHERE c.id = $1
       ${lock}
    `,
    [courseId, userId],
  );

  const row = result.rows[0];

  return row
    ? {
        courseId,
        institutionId: row.institution_id,
        courseStatus: row.status,
        role: row.role,
      }
    : null;
}

async function activityAccess(
  client: PoolClient,
  userId: string,
  activityId: string,
) {
  const result = await client.query<{
    course_id: string;
    status: ActivityStatus;
  }>(
    `SELECT course_id, status FROM activities WHERE id = $1`,
    [activityId],
  );

  const activity = result.rows[0];

  if (!activity) {
    return null;
  }

  const access = await courseAccess(
    client,
    userId,
    activity.course_id,
    'FOR SHARE OF c',
  );

  // Students never learn that draft or archived activities exist.
  if (
    !access ||
    (access.role === 'STUDENT' && activity.status !== 'PUBLISHED')
  ) {
    return null;
  }

  return { ...access, activityStatus: activity.status };
}

const COURSE_SUMMARY_SELECT = `
  SELECT
    c.id,
    c.institution_id,
    c.name,
    c.code,
    c.description,
    c.status,
    c.join_code,
    c.join_enabled,
    c.created_at,
    cm.role AS viewer_role,
    (
      SELECT count(*)::int
        FROM course_members s
        JOIN institution_memberships sim
          ON sim.user_id = s.user_id
         AND sim.institution_id = c.institution_id
         AND sim.role = 'STUDENT'
         AND sim.status = 'ACTIVE'
       WHERE s.course_id = c.id
         AND s.role = 'STUDENT'
         AND s.status = 'ACTIVE'
    ) AS student_count,
    (
      SELECT count(*)::int
        FROM activities a
       WHERE a.course_id = c.id
         AND (cm.role = 'TEACHER' OR a.status = 'PUBLISHED')
    ) AS activity_count
  FROM courses c
  JOIN course_members cm
    ON cm.course_id = c.id
   AND cm.status = 'ACTIVE'
  JOIN institution_memberships im
    ON im.institution_id = c.institution_id
   AND im.user_id = cm.user_id
   AND im.status = 'ACTIVE'
   AND im.role::text = cm.role::text
`;

type CourseRow = {
  id: string;
  institution_id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: CourseStatus;
  join_code: string;
  join_enabled: boolean;
  created_at: Date;
  viewer_role: CourseRole;
  student_count: number;
  activity_count: number;
};

function toCourseSummary(row: CourseRow): CourseSummary {
  return {
    id: row.id,
    institutionId: row.institution_id,
    name: row.name,
    code: row.code,
    description: row.description,
    status: row.status,
    viewerRole: row.viewer_role,
    studentCount: row.student_count,
    activityCount: row.activity_count,
    createdAt: row.created_at,
  };
}

const ACTIVITY_COLUMNS = `
  a.id,
  a.course_id,
  a.title,
  a.instructions,
  a.rubric,
  a.kind,
  a.template_repo_url,
  a.resource_url,
  a.max_score,
  a.due_at,
  a.allow_late,
  a.status,
  a.created_at,
  a.updated_at
`;

type ActivityRow = {
  id: string;
  course_id: string;
  title: string;
  instructions: string;
  rubric: string | null;
  kind: ActivityKind;
  template_repo_url: string | null;
  resource_url: string | null;
  max_score: number | null;
  due_at: Date | null;
  allow_late: boolean;
  status: ActivityStatus;
  created_at: Date;
  updated_at: Date;
};

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    instructions: row.instructions,
    rubric: row.rubric,
    kind: row.kind,
    templateRepoUrl: row.template_repo_url,
    resourceUrl: row.resource_url,
    maxScore: row.max_score,
    dueAt: row.due_at,
    allowLate: row.allow_late,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SUBMISSION_COLUMNS = `
  s.id,
  s.attempt,
  s.content_url,
  s.commit_sha,
  s.text_content,
  s.is_late,
  s.feedback,
  s.score,
  s.reviewed_at,
  s.submitted_at
`;

type SubmissionRow = {
  id: string;
  attempt: number;
  content_url: string | null;
  commit_sha: string | null;
  text_content: string | null;
  is_late: boolean;
  feedback: string | null;
  score: string | null;
  reviewed_at: Date | null;
  submitted_at: Date;
};

function toSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    attempt: row.attempt,
    contentUrl: row.content_url,
    commitSha: row.commit_sha,
    textContent: row.text_content,
    isLate: row.is_late,
    feedback: row.feedback,
    score: toNumber(row.score),
    reviewedAt: row.reviewed_at,
    submittedAt: row.submitted_at,
  };
}

function submissionState(
  latest: { is_late: boolean; reviewed_at: Date | null } | null,
): SubmissionState {
  if (!latest) return 'MISSING';
  if (latest.reviewed_at) return 'REVIEWED';
  return latest.is_late ? 'LATE' : 'SUBMITTED';
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

export function createAcademicRepository(pool: Pool) {
  return Object.freeze({
    async getProfile(userId: string): Promise<UserProfile> {
      return transaction(pool, async client => {
        const result = await client.query<{
          display_name: string | null;
          contact_email: string | null;
          notify_deadlines: boolean;
          notify_feedback: boolean;
        }>(
          `
            SELECT display_name, contact_email, notify_deadlines, notify_feedback
              FROM users
             WHERE id = $1
          `,
          [userId],
        );

        const row = result.rows[0]!;

        return {
          displayName: row.display_name,
          contactEmail: row.contact_email,
          notifyDeadlines: row.notify_deadlines,
          notifyFeedback: row.notify_feedback,
        };
      });
    },

    async updateProfile(
      userId: string,
      profile: UserProfile,
    ): Promise<void> {
      await transaction(pool, async client => {
        await client.query(
          `
            UPDATE users
               SET display_name = $2,
                   contact_email = $3,
                   notify_deadlines = $4,
                   notify_feedback = $5,
                   updated_at = now()
             WHERE id = $1
          `,
          [
            userId,
            profile.displayName,
            profile.contactEmail,
            profile.notifyDeadlines,
            profile.notifyFeedback,
          ],
        );
      });
    },

    async listCourses(
      userId: string,
      institutionId: string,
    ): Promise<CourseSummary[]> {
      return transaction(pool, async client => {
        const result = await client.query<CourseRow>(
          `
            ${COURSE_SUMMARY_SELECT}
            WHERE cm.user_id = $1
              AND c.institution_id = $2
            ORDER BY c.status, c.name
          `,
          [userId, institutionId],
        );

        return result.rows.map(toCourseSummary);
      });
    },

    async createCourse(input: {
      actorUserId: string;
      institutionId: string;
      name: string;
      code: string | null;
      description: string | null;
    }): Promise<Ok<{ courseId: string }> | Fail<'FORBIDDEN'>> {
      return transaction(pool, async client => {
        if (
          !(await hasInstitutionRole(
            client,
            input.actorUserId,
            input.institutionId,
            'TEACHER',
          ))
        ) {
          return { status: 'FORBIDDEN' as const };
        }

        const created = await client.query<{ id: string }>(
          `
            INSERT INTO courses(
              institution_id, name, code, description, join_code, created_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `,
          [
            input.institutionId,
            input.name,
            input.code,
            input.description,
            newJoinCode(),
            input.actorUserId,
          ],
        );

        const courseId = created.rows[0]!.id;

        await client.query(
          `
            INSERT INTO course_members(course_id, user_id, role)
            VALUES ($1, $2, 'TEACHER')
          `,
          [courseId, input.actorUserId],
        );

        return { status: 'OK' as const, courseId };
      });
    },

    async getCourse(
      userId: string,
      courseId: string,
    ): Promise<Ok<{ course: CourseDetail }> | Fail<'NOT_FOUND'>> {
      return transaction(pool, async client => {
        const result = await client.query<CourseRow>(
          `
            ${COURSE_SUMMARY_SELECT}
            WHERE cm.user_id = $1
              AND c.id = $2
          `,
          [userId, courseId],
        );

        const row = result.rows[0];

        if (!row) {
          return { status: 'NOT_FOUND' as const };
        }

        const teacher = row.viewer_role === 'TEACHER';

        return {
          status: 'OK' as const,
          course: {
            ...toCourseSummary(row),
            joinCode: teacher ? row.join_code : null,
            joinEnabled: row.join_enabled,
          },
        };
      });
    },

    async updateCourse(input: {
      actorUserId: string;
      courseId: string;
      name: string;
      code: string | null;
      description: string | null;
      joinEnabled: boolean;
    }): Promise<Fail<'OK' | 'NOT_FOUND' | 'FORBIDDEN'>> {
      return transaction(pool, async client => {
        const access = await courseAccess(
          client,
          input.actorUserId,
          input.courseId,
          'FOR UPDATE OF c',
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        await client.query(
          `
            UPDATE courses
               SET name = $2, code = $3, description = $4,
                   join_enabled = $5, updated_at = now()
             WHERE id = $1
          `,
          [
            input.courseId,
            input.name,
            input.code,
            input.description,
            input.joinEnabled,
          ],
        );

        return { status: 'OK' as const };
      });
    },

    async setCourseStatus(input: {
      actorUserId: string;
      courseId: string;
      status: CourseStatus;
    }): Promise<Fail<'OK' | 'NOT_FOUND' | 'FORBIDDEN'>> {
      return transaction(pool, async client => {
        const access = await courseAccess(
          client,
          input.actorUserId,
          input.courseId,
          'FOR UPDATE OF c',
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        await client.query(
          `UPDATE courses SET status = $2, updated_at = now() WHERE id = $1`,
          [input.courseId, input.status],
        );

        return { status: 'OK' as const };
      });
    },

    async regenerateJoinCode(
      actorUserId: string,
      courseId: string,
    ): Promise<
      Ok<{ joinCode: string }> | Fail<'NOT_FOUND' | 'FORBIDDEN'>
    > {
      return transaction(pool, async client => {
        const access = await courseAccess(
          client,
          actorUserId,
          courseId,
          'FOR UPDATE OF c',
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        const joinCode = newJoinCode();

        await client.query(
          `UPDATE courses SET join_code = $2, updated_at = now() WHERE id = $1`,
          [courseId, joinCode],
        );

        return { status: 'OK' as const, joinCode };
      });
    },

    async joinCourseByCode(
      userId: string,
      joinCode: string,
    ): Promise<
      | Ok<{ courseId: string }>
      | Fail<'NOT_FOUND' | 'ALREADY_MEMBER' | 'REMOVED' | 'FORBIDDEN'>
    > {
      return transaction(pool, async client => {
        const course = await client.query<{
          id: string;
          institution_id: string;
        }>(
          `
            SELECT id, institution_id
              FROM courses
             WHERE join_code = $1
               AND status = 'ACTIVE'
               AND join_enabled
             FOR SHARE
          `,
          [joinCode],
        );

        const row = course.rows[0];

        // A code from another institution behaves exactly like a wrong code.
        if (
          !row ||
          !(await hasInstitutionRole(
            client,
            userId,
            row.institution_id,
            'STUDENT',
          ))
        ) {
          return { status: 'NOT_FOUND' as const };
        }

        const existing = await client.query<{
          status: 'ACTIVE' | 'REMOVED';
        }>(
          `
            SELECT status FROM course_members
             WHERE course_id = $1 AND user_id = $2
             FOR UPDATE
          `,
          [row.id, userId],
        );

        const current = existing.rows[0];

        if (current?.status === 'ACTIVE') {
          return { status: 'ALREADY_MEMBER' as const };
        }

        // A student removed by the teacher cannot undo that with the code.
        if (current?.status === 'REMOVED') {
          return { status: 'REMOVED' as const };
        }

        try {
          await client.query('SAVEPOINT join_course');
          await client.query(
            `
              INSERT INTO course_members(course_id, user_id, role)
              VALUES ($1, $2, 'STUDENT')
            `,
            [row.id, userId],
          );
        } catch (error) {
          if (isUniqueViolation(error)) {
            await client.query('ROLLBACK TO SAVEPOINT join_course');
            return { status: 'ALREADY_MEMBER' as const };
          }

          throw error;
        }

        return { status: 'OK' as const, courseId: row.id };
      });
    },

    async listCourseMembers(
      actorUserId: string,
      courseId: string,
    ): Promise<
      Ok<{ members: CourseMember[] }> | Fail<'NOT_FOUND' | 'FORBIDDEN'>
    > {
      return transaction(pool, async client => {
        const access = await courseAccess(client, actorUserId, courseId);

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        const result = await client.query<{
          id: string;
          user_id: string;
          login: string;
          avatar_url: string | null;
          display_name: string | null;
          role: CourseRole;
          group_name: string | null;
          created_at: Date;
        }>(
          `
            SELECT cm.id, cm.user_id, gi.login, gi.avatar_url,
                   u.display_name, cm.role, cm.group_name, cm.created_at
              FROM course_members cm
              JOIN users u ON u.id = cm.user_id
              JOIN github_identities gi ON gi.user_id = cm.user_id
              JOIN institution_memberships im
                ON im.user_id = cm.user_id
               AND im.institution_id = $2
               AND im.status = 'ACTIVE'
               AND im.role::text = cm.role::text
             WHERE cm.course_id = $1
               AND cm.status = 'ACTIVE'
             ORDER BY cm.role, cm.group_name NULLS LAST, gi.login
          `,
          [courseId, access.institutionId],
        );

        return {
          status: 'OK' as const,
          members: result.rows.map(row => ({
            memberId: row.id,
            userId: row.user_id,
            githubLogin: row.login,
            avatarUrl: row.avatar_url,
            displayName: row.display_name,
            role: row.role,
            groupName: row.group_name,
            joinedAt: row.created_at,
          })),
        };
      });
    },

    async listCourseCandidates(
      actorUserId: string,
      courseId: string,
      role: CourseRole,
    ): Promise<
      | Ok<{ candidates: CourseCandidate[] }>
      | Fail<'NOT_FOUND' | 'FORBIDDEN'>
    > {
      return transaction(pool, async client => {
        const access = await courseAccess(client, actorUserId, courseId);

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        const result = await client.query<{
          user_id: string;
          login: string;
          display_name: string | null;
        }>(
          `
            SELECT im.user_id, gi.login, u.display_name
              FROM institution_memberships im
              JOIN users u ON u.id = im.user_id
              JOIN github_identities gi ON gi.user_id = im.user_id
             WHERE im.institution_id = $1
               AND im.role = $2
               AND im.status = 'ACTIVE'
               AND NOT EXISTS (
                 SELECT 1 FROM course_members cm
                  WHERE cm.course_id = $3
                    AND cm.user_id = im.user_id
                    AND cm.status = 'ACTIVE'
               )
             ORDER BY gi.login
             LIMIT 200
          `,
          [access.institutionId, role, courseId],
        );

        return {
          status: 'OK' as const,
          candidates: result.rows.map(row => ({
            userId: row.user_id,
            githubLogin: row.login,
            displayName: row.display_name,
          })),
        };
      });
    },

    async addCourseMember(input: {
      actorUserId: string;
      courseId: string;
      userId: string;
      role: CourseRole;
    }): Promise<
      Fail<'OK' | 'NOT_FOUND' | 'FORBIDDEN' | 'NOT_IN_INSTITUTION' | 'ALREADY_MEMBER'>
    > {
      return transaction(pool, async client => {
        const access = await courseAccess(
          client,
          input.actorUserId,
          input.courseId,
          'FOR SHARE OF c',
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        // The target must already belong to the course's institution with that role.
        if (
          !(await hasInstitutionRole(
            client,
            input.userId,
            access.institutionId,
            input.role,
          ))
        ) {
          return { status: 'NOT_IN_INSTITUTION' as const };
        }

        const result = await client.query(
          `
            INSERT INTO course_members(course_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (course_id, user_id) DO UPDATE
               SET status = 'ACTIVE', role = EXCLUDED.role, updated_at = now()
             WHERE course_members.status = 'REMOVED'
          `,
          [input.courseId, input.userId, input.role],
        );

        return result.rowCount === 1
          ? { status: 'OK' as const }
          : { status: 'ALREADY_MEMBER' as const };
      });
    },

    async updateCourseMemberGroup(input: {
      actorUserId: string;
      courseId: string;
      memberId: string;
      groupName: string | null;
    }): Promise<Fail<'OK' | 'NOT_FOUND' | 'FORBIDDEN'>> {
      return transaction(pool, async client => {
        const access = await courseAccess(
          client,
          input.actorUserId,
          input.courseId,
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        const result = await client.query(
          `
            UPDATE course_members
               SET group_name = $3, updated_at = now()
             WHERE id = $2 AND course_id = $1 AND status = 'ACTIVE'
          `,
          [input.courseId, input.memberId, input.groupName],
        );

        return result.rowCount === 1
          ? { status: 'OK' as const }
          : { status: 'NOT_FOUND' as const };
      });
    },

    async removeCourseMember(input: {
      actorUserId: string;
      courseId: string;
      memberId: string;
    }): Promise<Fail<'OK' | 'NOT_FOUND' | 'FORBIDDEN' | 'SELF'>> {
      return transaction(pool, async client => {
        const access = await courseAccess(
          client,
          input.actorUserId,
          input.courseId,
          'FOR UPDATE OF c',
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        const member = await client.query<{ user_id: string }>(
          `
            SELECT user_id FROM course_members
             WHERE id = $2 AND course_id = $1 AND status = 'ACTIVE'
             FOR UPDATE
          `,
          [input.courseId, input.memberId],
        );

        const target = member.rows[0];

        if (!target) return { status: 'NOT_FOUND' as const };
        if (target.user_id === input.actorUserId) {
          return { status: 'SELF' as const };
        }

        await client.query(
          `
            UPDATE course_members
               SET status = 'REMOVED', updated_at = now()
             WHERE id = $1
          `,
          [input.memberId],
        );

        return { status: 'OK' as const };
      });
    },

    async listActivities(
      userId: string,
      courseId: string,
    ): Promise<
      | Ok<{ role: CourseRole; activities: StudentActivity[] | Activity[] }>
      | Fail<'NOT_FOUND'>
    > {
      return transaction(pool, async client => {
        const access = await courseAccess(client, userId, courseId);

        if (!access) return { status: 'NOT_FOUND' as const };

        if (access.role === 'TEACHER') {
          const result = await client.query<ActivityRow>(
            `
              SELECT ${ACTIVITY_COLUMNS}
                FROM activities a
               WHERE a.course_id = $1
               ORDER BY a.status = 'ARCHIVED', a.due_at NULLS LAST, a.created_at
            `,
            [courseId],
          );

          return {
            status: 'OK' as const,
            role: access.role,
            activities: result.rows.map(toActivity),
          };
        }

        const result = await client.query<
          ActivityRow & {
            is_late: boolean | null;
            reviewed_at: Date | null;
            score: string | null;
            submitted: boolean;
          }
        >(
          `
            SELECT ${ACTIVITY_COLUMNS},
                   latest.id IS NOT NULL AS submitted,
                   latest.is_late,
                   latest.reviewed_at,
                   latest.score
              FROM activities a
              LEFT JOIN LATERAL (
                SELECT s.id, s.is_late, s.reviewed_at, s.score
                  FROM submissions s
                 WHERE s.activity_id = a.id
                   AND s.student_user_id = $2
                 ORDER BY s.attempt DESC
                 LIMIT 1
              ) latest ON true
             WHERE a.course_id = $1
               AND a.status = 'PUBLISHED'
             ORDER BY a.due_at NULLS LAST, a.created_at
          `,
          [courseId, userId],
        );

        return {
          status: 'OK' as const,
          role: access.role,
          activities: result.rows.map(row => ({
            ...toActivity(row),
            myState: submissionState(
              row.submitted
                ? {
                    is_late: Boolean(row.is_late),
                    reviewed_at: row.reviewed_at,
                  }
                : null,
            ),
            myScore: toNumber(row.score),
          })),
        };
      });
    },

    async createActivity(input: {
      actorUserId: string;
      courseId: string;
      activity: ActivityInput;
    }): Promise<
      Ok<{ activityId: string }> | Fail<'NOT_FOUND' | 'FORBIDDEN' | 'COURSE_ARCHIVED'>
    > {
      return transaction(pool, async client => {
        const access = await courseAccess(
          client,
          input.actorUserId,
          input.courseId,
          'FOR SHARE OF c',
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }
        if (access.courseStatus !== 'ACTIVE') {
          return { status: 'COURSE_ARCHIVED' as const };
        }

        const a = input.activity;
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO activities(
              course_id, title, instructions, rubric, kind, template_repo_url,
              resource_url, max_score, due_at, allow_late, status, created_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
          `,
          [
            input.courseId,
            a.title,
            a.instructions,
            a.rubric,
            a.kind,
            a.templateRepoUrl,
            a.resourceUrl,
            a.maxScore,
            a.dueAt,
            a.allowLate,
            a.status,
            input.actorUserId,
          ],
        );

        return { status: 'OK' as const, activityId: created.rows[0]!.id };
      });
    },

    async assignmentRepository(userId: string, activityId: string, reserve: boolean, owners: Record<string, string>) {
      return transaction(pool, async client => {
        const access = await activityAccess(client, userId, activityId);
        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'STUDENT') return { status: 'FORBIDDEN' as const };
        type Reservation = { id: string; owner: string; name: string; template: string; repository_url: string | null };
        const lookup = () => client.query<Reservation>(
          'SELECT * FROM assignment_repositories WHERE activity_id = $1 AND student_id = $2',
          [activityId, userId],
        );
        let row = (await lookup()).rows[0];
        if (!reserve || row?.repository_url) {
          return { status: 'OK' as const, url: row?.repository_url ?? null };
        }
        if (access.courseStatus !== 'ACTIVE') return { status: 'COURSE_ARCHIVED' as const };
        const { rows: [activity] } = await client.query<{
          title: string; template_repo_url: string | null; eligible: boolean; github_user_id: string; login: string;
        }>(`SELECT a.title, a.template_repo_url, g.github_user_id, g.login,
                   (a.allow_late OR a.due_at IS NULL OR a.due_at >= now()) AS eligible
              FROM activities a JOIN github_identities g ON g.user_id = $2
             WHERE a.id = $1 AND a.kind = 'REPOSITORY' AND a.status = 'PUBLISHED' FOR SHARE OF a`, [activityId, userId]);
        if (!activity?.template_repo_url) return { status: 'INVALID_TEMPLATE' as const };
        if (!activity.eligible) return { status: 'DEADLINE_PASSED' as const };
        const owner = owners[access.institutionId]?.toLowerCase();
        if (!owner || (row && row.owner !== owner)) return { status: 'REPOSITORIES_UNCONFIGURED' as const };
        const match = /^https:\/\/github\.com\/([a-z0-9-]+\/[a-z0-9_.-]+)\/?$/i.exec(activity.template_repo_url);
        if (!match || match[1].split('/').some(part => part === '.' || part === '..')) return { status: 'INVALID_TEMPLATE' as const };
        if (!row) {
          const title = activity.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 46) || 'tarea';
          const name = title + '-' + activity.login.toLowerCase();
          const insert = (name: string) => client.query<Reservation>(
            `INSERT INTO assignment_repositories(activity_id, student_id, owner, name, template)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *`,
            [activityId, userId, owner, name, match[1]],
          );
          row = (await insert(name)).rows[0] ?? (await lookup()).rows[0];
          if (!row) row = (await insert(name + '-' + randomUUID().slice(0, 8))).rows[0] ?? (await lookup()).rows[0];
          if (!row) return { status: 'REPOSITORY_CONFLICT' as const };
        }
        const teachers = await client.query<{ github_user_id: string }>(
          `SELECT g.github_user_id FROM course_members cm
             JOIN github_identities g ON g.user_id = cm.user_id
             JOIN institution_memberships im ON im.institution_id = $2 AND im.user_id = cm.user_id
            WHERE cm.course_id = $1 AND cm.role = 'TEACHER' AND cm.status = 'ACTIVE'
              AND im.role = 'TEACHER' AND im.status = 'ACTIVE'`, [access.courseId, access.institutionId]);
        return { status: 'OK' as const, url: row.repository_url, reservation: { ...row, template: match[1] }, institutionId: access.institutionId,
          student: String(activity.github_user_id), teachers: teachers.rows.map(t => String(t.github_user_id)) };
      });
    },

    async completeAssignmentRepository(id: string, url: string) {
      await pool.query('UPDATE assignment_repositories SET repository_url = $2 WHERE id = $1', [id, url]);
    },

    async getActivity(
      userId: string,
      activityId: string,
    ): Promise<
      | Ok<{ role: CourseRole; activity: Activity; courseName: string }>
      | Fail<'NOT_FOUND'>
    > {
      return transaction(pool, async client => {
        const access = await activityAccess(client, userId, activityId);

        if (!access) return { status: 'NOT_FOUND' as const };

        const result = await client.query<ActivityRow & { course_name: string }>(
          `
            SELECT ${ACTIVITY_COLUMNS}, c.name AS course_name
              FROM activities a
              JOIN courses c ON c.id = a.course_id
             WHERE a.id = $1
          `,
          [activityId],
        );

        const row = result.rows[0]!;

        return {
          status: 'OK' as const,
          role: access.role,
          activity: toActivity(row),
          courseName: row.course_name,
        };
      });
    },

    async updateActivity(input: {
      actorUserId: string;
      activityId: string;
      activity: ActivityInput;
    }): Promise<Fail<'OK' | 'NOT_FOUND' | 'FORBIDDEN'>> {
      return transaction(pool, async client => {
        const access = await activityAccess(
          client,
          input.actorUserId,
          input.activityId,
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        const a = input.activity;

        await client.query(
          `
            UPDATE activities
               SET title = $2, instructions = $3, rubric = $4, kind = $5,
                   template_repo_url = $6, resource_url = $7, max_score = $8,
                   due_at = $9, allow_late = $10, status = $11, updated_at = now()
             WHERE id = $1
          `,
          [
            input.activityId,
            a.title,
            a.instructions,
            a.rubric,
            a.kind,
            a.templateRepoUrl,
            a.resourceUrl,
            a.maxScore,
            a.dueAt,
            a.allowLate,
            a.status,
          ],
        );

        return { status: 'OK' as const };
      });
    },

    async submit(input: {
      userId: string;
      activityId: string;
      submission: SubmissionInput;
    }): Promise<
      | Ok<{ submissionId: string; attempt: number; isLate: boolean }>
      | Fail<
          | 'NOT_FOUND'
          | 'FORBIDDEN'
          | 'COURSE_ARCHIVED'
          | 'DEADLINE_PASSED'
          | 'INVALID_SUBMISSION'
          | 'CONFLICT'
        >
    > {
      return transaction(pool, async client => {
        const access = await activityAccess(
          client,
          input.userId,
          input.activityId,
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'STUDENT') {
          return { status: 'FORBIDDEN' as const };
        }
        if (access.courseStatus !== 'ACTIVE') {
          return { status: 'COURSE_ARCHIVED' as const };
        }

        const activity = await client.query<{
          kind: ActivityKind;
          due_at: Date | null;
          allow_late: boolean;
          late: boolean;
        }>(
          `
            SELECT kind, due_at, allow_late,
                   (due_at IS NOT NULL AND due_at < now()) AS late
              FROM activities
             WHERE id = $1
             FOR SHARE
          `,
          [input.activityId],
        );

        const row = activity.rows[0]!;
        const { contentUrl, commitSha, textContent } = input.submission;

        const valid =
          row.kind === 'TEXT'
            ? Boolean(textContent)
            : row.kind === 'REPOSITORY'
              ? Boolean(contentUrl && GITHUB_REPO_URL.test(contentUrl))
              : Boolean(contentUrl);

        if (!valid || (commitSha && row.kind !== 'REPOSITORY')) {
          return { status: 'INVALID_SUBMISSION' as const };
        }

        if (row.late && !row.allow_late) {
          return { status: 'DEADLINE_PASSED' as const };
        }

        const next = await client.query<{ attempt: number }>(
          `
            SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt
              FROM submissions
             WHERE activity_id = $1 AND student_user_id = $2
          `,
          [input.activityId, input.userId],
        );

        const attempt = next.rows[0]!.attempt;

        try {
          await client.query('SAVEPOINT submit_attempt');
          const created = await client.query<{ id: string }>(
            `
              INSERT INTO submissions(
                activity_id, student_user_id, attempt, content_url,
                commit_sha, text_content, is_late
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id
            `,
            [
              input.activityId,
              input.userId,
              attempt,
              row.kind === 'TEXT' ? null : contentUrl,
              row.kind === 'REPOSITORY' ? commitSha : null,
              row.kind === 'TEXT' ? textContent : null,
              row.late,
            ],
          );

          return {
            status: 'OK' as const,
            submissionId: created.rows[0]!.id,
            attempt,
            isLate: row.late,
          };
        } catch (error) {
          // Two simultaneous submissions picked the same attempt number.
          if (isUniqueViolation(error)) {
            await client.query('ROLLBACK TO SAVEPOINT submit_attempt');
            return { status: 'CONFLICT' as const };
          }

          throw error;
        }
      });
    },

    async listMySubmissions(
      userId: string,
      activityId: string,
    ): Promise<Ok<{ submissions: Submission[] }> | Fail<'NOT_FOUND'>> {
      return transaction(pool, async client => {
        const access = await activityAccess(client, userId, activityId);

        if (!access || access.role !== 'STUDENT') {
          return { status: 'NOT_FOUND' as const };
        }

        const result = await client.query<SubmissionRow>(
          `
            SELECT ${SUBMISSION_COLUMNS}
              FROM submissions s
             WHERE s.activity_id = $1 AND s.student_user_id = $2
             ORDER BY s.attempt DESC
          `,
          [activityId, userId],
        );

        return {
          status: 'OK' as const,
          submissions: result.rows.map(toSubmission),
        };
      });
    },

    async listActivitySubmissions(
      actorUserId: string,
      activityId: string,
    ): Promise<
      | Ok<{ students: StudentSubmissionStatus[] }>
      | Fail<'NOT_FOUND' | 'FORBIDDEN'>
    > {
      return transaction(pool, async client => {
        const access = await activityAccess(
          client,
          actorUserId,
          activityId,
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        const result = await client.query<
          Partial<SubmissionRow> & {
            user_id: string;
            login: string;
            display_name: string | null;
            group_name: string | null;
            attempts: number;
            submission_id: string | null;
          }
        >(
          `
            SELECT cm.user_id, gi.login, u.display_name, cm.group_name,
                   (SELECT count(*)::int FROM submissions x
                     WHERE x.activity_id = $1 AND x.student_user_id = cm.user_id
                   ) AS attempts,
                   s.id AS submission_id,
                   s.attempt, s.content_url, s.commit_sha, s.text_content,
                   s.is_late, s.feedback, s.score, s.reviewed_at, s.submitted_at
              FROM course_members cm
              JOIN users u ON u.id = cm.user_id
              JOIN github_identities gi ON gi.user_id = cm.user_id
              JOIN institution_memberships im
                ON im.user_id = cm.user_id
               AND im.institution_id = $3
               AND im.role = 'STUDENT'
               AND im.status = 'ACTIVE'
              LEFT JOIN LATERAL (
                SELECT * FROM submissions s
                 WHERE s.activity_id = $1 AND s.student_user_id = cm.user_id
                 ORDER BY s.attempt DESC
                 LIMIT 1
              ) s ON true
             WHERE cm.course_id = $2
               AND cm.role = 'STUDENT'
               AND cm.status = 'ACTIVE'
             ORDER BY cm.group_name NULLS LAST, gi.login
          `,
          [activityId, access.courseId, access.institutionId],
        );

        return {
          status: 'OK' as const,
          students: result.rows.map(row => {
            const latest = row.submission_id
              ? toSubmission({
                  ...(row as SubmissionRow),
                  id: row.submission_id,
                })
              : null;

            return {
              userId: row.user_id,
              githubLogin: row.login,
              displayName: row.display_name,
              groupName: row.group_name,
              attempts: row.attempts,
              state: submissionState(
                latest
                  ? {
                      is_late: latest.isLate,
                      reviewed_at: latest.reviewedAt,
                    }
                  : null,
              ),
              latest,
            };
          }),
        };
      });
    },

    async reviewSubmission(input: {
      actorUserId: string;
      submissionId: string;
      feedback: string | null;
      score: number | null;
    }): Promise<Fail<'OK' | 'NOT_FOUND' | 'FORBIDDEN' | 'SCORE_OUT_OF_RANGE'>> {
      return transaction(pool, async client => {
        const submission = await client.query<{
          activity_id: string;
          max_score: number | null;
        }>(
          `
            SELECT s.activity_id, a.max_score
              FROM submissions s
              JOIN activities a ON a.id = s.activity_id
             WHERE s.id = $1
             FOR UPDATE OF s
          `,
          [input.submissionId],
        );

        const row = submission.rows[0];

        if (!row) return { status: 'NOT_FOUND' as const };

        const access = await activityAccess(
          client,
          input.actorUserId,
          row.activity_id,
        );

        if (!access) return { status: 'NOT_FOUND' as const };
        if (access.role !== 'TEACHER') {
          return { status: 'FORBIDDEN' as const };
        }

        if (
          input.score !== null &&
          row.max_score !== null &&
          input.score > row.max_score
        ) {
          return { status: 'SCORE_OUT_OF_RANGE' as const };
        }

        await client.query(
          `
            UPDATE submissions
               SET feedback = $2, score = $3,
                   reviewed_by_user_id = $4, reviewed_at = now()
             WHERE id = $1
          `,
          [
            input.submissionId,
            input.feedback,
            input.score,
            input.actorUserId,
          ],
        );

        return { status: 'OK' as const };
      });
    },

    async studentDashboard(
      userId: string,
      institutionId: string,
    ): Promise<Ok<{ dashboard: StudentDashboard }> | Fail<'FORBIDDEN'>> {
      return transaction(pool, async client => {
        if (
          !(await hasInstitutionRole(client, userId, institutionId, 'STUDENT'))
        ) {
          return { status: 'FORBIDDEN' as const };
        }

        const courses = await client.query<CourseRow>(
          `
            ${COURSE_SUMMARY_SELECT}
            WHERE cm.user_id = $1
              AND cm.role = 'STUDENT'
              AND c.institution_id = $2
              AND c.status = 'ACTIVE'
            ORDER BY c.name
          `,
          [userId, institutionId],
        );

        const pending = await client.query<{
          id: string;
          course_id: string;
          course_name: string;
          title: string;
          due_at: Date | null;
          overdue: boolean;
        }>(
          `
            SELECT a.id, a.course_id, c.name AS course_name, a.title, a.due_at,
                   (a.due_at IS NOT NULL AND a.due_at < now()) AS overdue
              FROM activities a
              JOIN courses c ON c.id = a.course_id
              JOIN course_members cm
                ON cm.course_id = c.id
               AND cm.user_id = $1
               AND cm.role = 'STUDENT'
               AND cm.status = 'ACTIVE'
             WHERE c.institution_id = $2
               AND c.status = 'ACTIVE'
               AND a.status = 'PUBLISHED'
               AND NOT EXISTS (
                 SELECT 1 FROM submissions s
                  WHERE s.activity_id = a.id AND s.student_user_id = $1
               )
             ORDER BY a.due_at NULLS LAST
             LIMIT 30
          `,
          [userId, institutionId],
        );

        const feedback = await client.query<{
          id: string;
          course_id: string;
          course_name: string;
          title: string;
          due_at: Date | null;
          score: string | null;
          max_score: number | null;
          reviewed_at: Date;
        }>(
          `
            SELECT a.id, a.course_id, c.name AS course_name, a.title, a.due_at,
                   s.score, a.max_score, s.reviewed_at
              FROM submissions s
              JOIN activities a ON a.id = s.activity_id
              JOIN courses c ON c.id = a.course_id
              JOIN course_members cm
                ON cm.course_id = c.id
               AND cm.user_id = $1
               AND cm.status = 'ACTIVE'
             WHERE s.student_user_id = $1
               AND s.reviewed_at IS NOT NULL
               AND c.institution_id = $2
               AND a.status = 'PUBLISHED'
             ORDER BY s.reviewed_at DESC
             LIMIT 5
          `,
          [userId, institutionId],
        );

        const toItem = (row: {
          id: string;
          course_id: string;
          course_name: string;
          title: string;
          due_at: Date | null;
        }): DashboardActivity => ({
          activityId: row.id,
          courseId: row.course_id,
          courseName: row.course_name,
          title: row.title,
          dueAt: row.due_at,
        });

        return {
          status: 'OK' as const,
          dashboard: {
            courses: courses.rows.map(toCourseSummary),
            upcoming: pending.rows
              .filter(row => !row.overdue)
              .slice(0, 10)
              .map(toItem),
            overdue: pending.rows.filter(row => row.overdue).map(toItem),
            recentFeedback: feedback.rows.map(row => ({
              ...toItem(row),
              score: toNumber(row.score),
              maxScore: row.max_score,
              reviewedAt: row.reviewed_at,
            })),
          },
        };
      });
    },

    async teacherDashboard(
      userId: string,
      institutionId: string,
    ): Promise<Ok<{ dashboard: TeacherDashboard }> | Fail<'FORBIDDEN'>> {
      return transaction(pool, async client => {
        if (
          !(await hasInstitutionRole(client, userId, institutionId, 'TEACHER'))
        ) {
          return { status: 'FORBIDDEN' as const };
        }

        const courses = await client.query<CourseRow>(
          `
            ${COURSE_SUMMARY_SELECT}
            WHERE cm.user_id = $1
              AND cm.role = 'TEACHER'
              AND c.institution_id = $2
              AND c.status = 'ACTIVE'
            ORDER BY c.name
          `,
          [userId, institutionId],
        );

        // Per activity: latest attempt per active student, counted as pending review or missing.
        const stats = await client.query<{
          id: string;
          course_id: string;
          course_name: string;
          title: string;
          due_at: Date | null;
          past_due: boolean;
          pending: number;
          missing: number;
        }>(
          `
            WITH taught AS (
              SELECT c.id, c.name
                FROM courses c
                JOIN course_members cm
                  ON cm.course_id = c.id
                 AND cm.user_id = $1
                 AND cm.role = 'TEACHER'
                 AND cm.status = 'ACTIVE'
               WHERE c.institution_id = $2
                 AND c.status = 'ACTIVE'
            ),
            students AS (
              SELECT cm.course_id, cm.user_id
                FROM course_members cm
                JOIN taught t ON t.id = cm.course_id
                JOIN institution_memberships im
                  ON im.user_id = cm.user_id
                 AND im.institution_id = $2
                 AND im.role = 'STUDENT'
                 AND im.status = 'ACTIVE'
               WHERE cm.role = 'STUDENT'
                 AND cm.status = 'ACTIVE'
            )
            SELECT a.id, a.course_id, t.name AS course_name, a.title, a.due_at,
                   (a.due_at IS NOT NULL AND a.due_at < now()) AS past_due,
                   count(*) FILTER (
                     WHERE latest.id IS NOT NULL AND latest.reviewed_at IS NULL
                   )::int AS pending,
                   count(*) FILTER (
                     WHERE st.user_id IS NOT NULL AND latest.id IS NULL
                   )::int AS missing
              FROM activities a
              JOIN taught t ON t.id = a.course_id
              LEFT JOIN students st ON st.course_id = a.course_id
              LEFT JOIN LATERAL (
                SELECT s.id, s.reviewed_at
                  FROM submissions s
                 WHERE s.activity_id = a.id
                   AND s.student_user_id = st.user_id
                 ORDER BY s.attempt DESC
                 LIMIT 1
              ) latest ON true
             WHERE a.status = 'PUBLISHED'
             GROUP BY a.id, t.name
             ORDER BY a.due_at NULLS LAST
          `,
          [userId, institutionId],
        );

        const toItem = (row: (typeof stats.rows)[number]) => ({
          activityId: row.id,
          courseId: row.course_id,
          courseName: row.course_name,
          title: row.title,
          dueAt: row.due_at,
        });

        return {
          status: 'OK' as const,
          dashboard: {
            courses: courses.rows.map(toCourseSummary),
            toReview: stats.rows
              .filter(row => row.pending > 0)
              .map(row => ({ ...toItem(row), pending: row.pending })),
            upcoming: stats.rows
              .filter(row => row.due_at && !row.past_due)
              .slice(0, 10)
              .map(toItem),
            missingAfterDue: stats.rows
              .filter(row => row.past_due && row.missing > 0)
              .map(row => ({ ...toItem(row), missing: row.missing })),
          },
        };
      });
    },
  });
}
