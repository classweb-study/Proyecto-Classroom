import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import type {
  ActivityInput,
  ActivityKind,
  ActivityStatus,
  createAcademicRepository,
} from '@classroom/database';

type AcademicRepository = ReturnType<typeof createAcademicRepository>;

type RouteActor = (
  request: FastifyRequest<{ Params: Record<string, string> }>,
  reply: FastifyReply,
  idParams: string[],
) => Promise<{ userId: string } | null>;

const RESULT_ERRORS: Record<string, [number, string]> = {
  FORBIDDEN: [403, 'FORBIDDEN'],
  NOT_FOUND: [404, 'NOT_FOUND'],
  SELF: [409, 'CANNOT_REMOVE_YOURSELF'],
  ALREADY_MEMBER: [409, 'ALREADY_MEMBER'],
  REMOVED: [403, 'COURSE_ACCESS_REMOVED'],
  NOT_IN_INSTITUTION: [409, 'USER_NOT_IN_INSTITUTION'],
  COURSE_ARCHIVED: [409, 'COURSE_ARCHIVED'],
  DEADLINE_PASSED: [409, 'DEADLINE_PASSED'],
  INVALID_SUBMISSION: [400, 'INVALID_SUBMISSION'],
  CONFLICT: [409, 'SUBMISSION_CONFLICT'],
  SCORE_OUT_OF_RANGE: [400, 'SCORE_OUT_OF_RANGE'],
};

function sendResult<T extends { status: string }>(
  reply: FastifyReply,
  result: T,
  body: (result: Extract<T, { status: 'OK' }>) => unknown,
  successCode = 200,
) {
  if (result.status !== 'OK') {
    const [code, error] = RESULT_ERRORS[result.status] ?? [
      500,
      'INTERNAL_ERROR',
    ];

    return reply.code(code).send({ error });
  }

  return reply
    .code(successCode)
    .send(body(result as Extract<T, { status: 'OK' }>));
}

function invalid(reply: FastifyReply, error = 'INVALID_REQUEST') {
  return reply.code(400).send({ error });
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** undefined → field absent; null → explicitly empty; false → invalid. */
function optionalText(
  value: unknown,
  max: number,
): string | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length <= max ? trimmed : false;
}

function requiredText(value: unknown, min: number, max: number) {
  const text = optionalText(value, max);
  return typeof text === 'string' && text.length >= min ? text : null;
}

function optionalHttpsUrl(value: unknown): string | null | false {
  const text = optionalText(value, 500);
  if (text === null || text === false) return text;

  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.toString()
      : false;
  } catch {
    return false;
  }
}

const ACTIVITY_KINDS: ActivityKind[] = ['REPOSITORY', 'LINK', 'TEXT'];
const ACTIVITY_STATUSES: ActivityStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
];

function parseActivity(body: Record<string, unknown>): ActivityInput | null {
  const title = requiredText(body.title, 2, 160);
  const instructions = requiredText(body.instructions, 1, 10000);
  const rubric = optionalText(body.rubric, 5000);
  const templateRepoUrl = optionalHttpsUrl(body.templateRepoUrl);
  const resourceUrl = optionalHttpsUrl(body.resourceUrl);
  const kind = body.kind as ActivityKind;
  const status = (body.status ?? 'DRAFT') as ActivityStatus;

  let dueAt: Date | null = null;

  if (body.dueAt !== undefined && body.dueAt !== null && body.dueAt !== '') {
    if (typeof body.dueAt !== 'string') return null;
    dueAt = new Date(body.dueAt);
    if (Number.isNaN(dueAt.getTime())) return null;
  }

  let maxScore: number | null = null;

  if (body.maxScore !== undefined && body.maxScore !== null && body.maxScore !== '') {
    if (
      typeof body.maxScore !== 'number' ||
      !Number.isInteger(body.maxScore) ||
      body.maxScore < 1 ||
      body.maxScore > 1000
    ) {
      return null;
    }
    maxScore = body.maxScore;
  }

  if (
    !title ||
    !instructions ||
    rubric === false ||
    templateRepoUrl === false ||
    resourceUrl === false ||
    !ACTIVITY_KINDS.includes(kind) ||
    !ACTIVITY_STATUSES.includes(status) ||
    (body.allowLate !== undefined && typeof body.allowLate !== 'boolean')
  ) {
    return null;
  }

  return {
    title,
    instructions,
    rubric,
    kind,
    templateRepoUrl: kind === 'REPOSITORY' ? templateRepoUrl : null,
    resourceUrl,
    maxScore,
    dueAt,
    allowLate: body.allowLate ?? true,
    status,
  };
}

type Body = Record<string, unknown> | undefined;

export function registerAcademicRoutes(
  app: FastifyInstance,
  academic: AcademicRepository,
  routeActor: RouteActor,
) {
  app.get('/me/profile', async (request, reply) => {
    const user = await routeActor(request as never, reply, []);
    if (!user) return reply;

    return { profile: await academic.getProfile(user.userId) };
  });

  app.patch<{ Body: Body }>('/me/profile', async (request, reply) => {
    const user = await routeActor(request as never, reply, []);
    if (!user) return reply;

    const body = request.body ?? {};
    const displayName = optionalText(body.displayName, 120);
    const contactEmail = optionalText(body.contactEmail, 254);

    if (
      displayName === false ||
      contactEmail === false ||
      (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) ||
      typeof body.notifyDeadlines !== 'boolean' ||
      typeof body.notifyFeedback !== 'boolean'
    ) {
      return invalid(reply, 'INVALID_PROFILE');
    }

    await academic.updateProfile(user.userId, {
      displayName,
      contactEmail: contactEmail ? contactEmail.toLowerCase() : null,
      notifyDeadlines: body.notifyDeadlines,
      notifyFeedback: body.notifyFeedback,
    });

    return { status: 'UPDATED' };
  });

  app.get<{ Querystring: { institutionId?: string; role?: string } }>(
    '/me/dashboard',
    async (request, reply) => {
      const user = await routeActor(request as never, reply, []);
      if (!user) return reply;

      const { institutionId, role } = request.query;

      if (!institutionId || !UUID.test(institutionId)) {
        return invalid(reply);
      }

      if (role === 'STUDENT') {
        const result = await academic.studentDashboard(
          user.userId,
          institutionId,
        );
        return sendResult(reply, result, r => ({ dashboard: r.dashboard }));
      }

      if (role === 'TEACHER') {
        const result = await academic.teacherDashboard(
          user.userId,
          institutionId,
        );
        return sendResult(reply, result, r => ({ dashboard: r.dashboard }));
      }

      return invalid(reply, 'INVALID_ROLE');
    },
  );

  app.get<{ Querystring: { institutionId?: string } }>(
    '/courses',
    async (request, reply) => {
      const user = await routeActor(request as never, reply, []);
      if (!user) return reply;

      const { institutionId } = request.query;

      if (!institutionId || !UUID.test(institutionId)) {
        return invalid(reply);
      }

      return {
        courses: await academic.listCourses(user.userId, institutionId),
      };
    },
  );

  app.post<{ Body: Body }>('/courses', async (request, reply) => {
    const user = await routeActor(request as never, reply, []);
    if (!user) return reply;

    const body = request.body ?? {};
    const institutionId = body.institutionId;
    const name = requiredText(body.name, 2, 120);
    const code = optionalText(body.code, 40);
    const description = optionalText(body.description, 4000);

    if (
      typeof institutionId !== 'string' ||
      !UUID.test(institutionId) ||
      !name ||
      code === false ||
      description === false
    ) {
      return invalid(reply, 'INVALID_COURSE');
    }

    const result = await academic.createCourse({
      actorUserId: user.userId,
      institutionId,
      name,
      code,
      description,
    });

    return sendResult(reply, result, r => ({ courseId: r.courseId }), 201);
  });

  app.post<{ Body: Body }>('/courses/join', async (request, reply) => {
    const user = await routeActor(request as never, reply, []);
    if (!user) return reply;

    const raw = request.body?.code;
    const code =
      typeof raw === 'string' ? raw.trim().toUpperCase().replace(/[\s-]/g, '') : '';

    if (!/^[A-Z0-9]{6,12}$/.test(code)) {
      return invalid(reply, 'INVALID_JOIN_CODE');
    }

    const result = await academic.joinCourseByCode(user.userId, code);

    return sendResult(reply, result, r => ({ courseId: r.courseId }), 201);
  });

  app.get<{ Params: { courseId: string } }>(
    '/courses/:courseId',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['courseId']);
      if (!user) return reply;

      const result = await academic.getCourse(
        user.userId,
        request.params.courseId,
      );

      return sendResult(reply, result, r => ({ course: r.course }));
    },
  );

  app.patch<{ Params: { courseId: string }; Body: Body }>(
    '/courses/:courseId',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['courseId']);
      if (!user) return reply;

      const body = request.body ?? {};
      const name = requiredText(body.name, 2, 120);
      const code = optionalText(body.code, 40);
      const description = optionalText(body.description, 4000);

      if (
        !name ||
        code === false ||
        description === false ||
        typeof body.joinEnabled !== 'boolean'
      ) {
        return invalid(reply, 'INVALID_COURSE');
      }

      const result = await academic.updateCourse({
        actorUserId: user.userId,
        courseId: request.params.courseId,
        name,
        code,
        description,
        joinEnabled: body.joinEnabled,
      });

      return sendResult(reply, result, () => ({ status: 'UPDATED' }));
    },
  );

  for (const [path, status] of [
    ['archive', 'ARCHIVED'],
    ['unarchive', 'ACTIVE'],
  ] as const) {
    app.post<{ Params: { courseId: string } }>(
      `/courses/:courseId/${path}`,
      async (request, reply) => {
        const user = await routeActor(request, reply, ['courseId']);
        if (!user) return reply;

        const result = await academic.setCourseStatus({
          actorUserId: user.userId,
          courseId: request.params.courseId,
          status,
        });

        return sendResult(reply, result, () => ({ status }));
      },
    );
  }

  app.post<{ Params: { courseId: string } }>(
    '/courses/:courseId/join-code',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['courseId']);
      if (!user) return reply;

      const result = await academic.regenerateJoinCode(
        user.userId,
        request.params.courseId,
      );

      return sendResult(reply, result, r => ({ joinCode: r.joinCode }));
    },
  );

  app.get<{ Params: { courseId: string } }>(
    '/courses/:courseId/members',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['courseId']);
      if (!user) return reply;

      const result = await academic.listCourseMembers(
        user.userId,
        request.params.courseId,
      );

      return sendResult(reply, result, r => ({ members: r.members }));
    },
  );

  app.get<{
    Params: { courseId: string };
    Querystring: { role?: string };
  }>('/courses/:courseId/candidates', async (request, reply) => {
    const user = await routeActor(request, reply, ['courseId']);
    if (!user) return reply;

    const role = request.query.role ?? 'STUDENT';

    if (role !== 'STUDENT' && role !== 'TEACHER') {
      return invalid(reply, 'INVALID_ROLE');
    }

    const result = await academic.listCourseCandidates(
      user.userId,
      request.params.courseId,
      role,
    );

    return sendResult(reply, result, r => ({ candidates: r.candidates }));
  });

  app.post<{ Params: { courseId: string }; Body: Body }>(
    '/courses/:courseId/members',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['courseId']);
      if (!user) return reply;

      const userId = request.body?.userId;
      const role = request.body?.role ?? 'STUDENT';

      if (
        typeof userId !== 'string' ||
        !UUID.test(userId) ||
        (role !== 'STUDENT' && role !== 'TEACHER')
      ) {
        return invalid(reply);
      }

      const result = await academic.addCourseMember({
        actorUserId: user.userId,
        courseId: request.params.courseId,
        userId,
        role,
      });

      return sendResult(reply, result, () => ({ status: 'ADDED' }), 201);
    },
  );

  app.patch<{ Params: { courseId: string; memberId: string }; Body: Body }>(
    '/courses/:courseId/members/:memberId',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['courseId', 'memberId']);
      if (!user) return reply;

      const groupName = optionalText(request.body?.groupName, 60);

      if (groupName === false) {
        return invalid(reply, 'INVALID_GROUP');
      }

      const result = await academic.updateCourseMemberGroup({
        actorUserId: user.userId,
        courseId: request.params.courseId,
        memberId: request.params.memberId,
        groupName,
      });

      return sendResult(reply, result, () => ({ status: 'UPDATED' }));
    },
  );

  app.delete<{ Params: { courseId: string; memberId: string } }>(
    '/courses/:courseId/members/:memberId',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['courseId', 'memberId']);
      if (!user) return reply;

      const result = await academic.removeCourseMember({
        actorUserId: user.userId,
        courseId: request.params.courseId,
        memberId: request.params.memberId,
      });

      return sendResult(reply, result, () => ({ status: 'REMOVED' }));
    },
  );

  app.get<{ Params: { courseId: string } }>(
    '/courses/:courseId/activities',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['courseId']);
      if (!user) return reply;

      const result = await academic.listActivities(
        user.userId,
        request.params.courseId,
      );

      return sendResult(reply, result, r => ({
        role: r.role,
        activities: r.activities,
      }));
    },
  );

  app.post<{ Params: { courseId: string }; Body: Body }>(
    '/courses/:courseId/activities',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['courseId']);
      if (!user) return reply;

      const activity = parseActivity(request.body ?? {});

      if (!activity) {
        return invalid(reply, 'INVALID_ACTIVITY');
      }

      const result = await academic.createActivity({
        actorUserId: user.userId,
        courseId: request.params.courseId,
        activity,
      });

      return sendResult(
        reply,
        result,
        r => ({ activityId: r.activityId }),
        201,
      );
    },
  );

  app.get<{ Params: { activityId: string } }>(
    '/activities/:activityId',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['activityId']);
      if (!user) return reply;

      const result = await academic.getActivity(
        user.userId,
        request.params.activityId,
      );

      return sendResult(reply, result, r => ({
        role: r.role,
        activity: r.activity,
        courseName: r.courseName,
      }));
    },
  );

  app.patch<{ Params: { activityId: string }; Body: Body }>(
    '/activities/:activityId',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['activityId']);
      if (!user) return reply;

      const activity = parseActivity(request.body ?? {});

      if (!activity) {
        return invalid(reply, 'INVALID_ACTIVITY');
      }

      const result = await academic.updateActivity({
        actorUserId: user.userId,
        activityId: request.params.activityId,
        activity,
      });

      return sendResult(reply, result, () => ({ status: 'UPDATED' }));
    },
  );

  app.get<{ Params: { activityId: string } }>(
    '/activities/:activityId/submissions',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['activityId']);
      if (!user) return reply;

      const result = await academic.listActivitySubmissions(
        user.userId,
        request.params.activityId,
      );

      return sendResult(reply, result, r => ({ students: r.students }));
    },
  );

  app.get<{ Params: { activityId: string } }>(
    '/activities/:activityId/my-submissions',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['activityId']);
      if (!user) return reply;

      const result = await academic.listMySubmissions(
        user.userId,
        request.params.activityId,
      );

      return sendResult(reply, result, r => ({
        submissions: r.submissions,
      }));
    },
  );

  app.post<{ Params: { activityId: string }; Body: Body }>(
    '/activities/:activityId/submissions',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['activityId']);
      if (!user) return reply;

      const body = request.body ?? {};
      const contentUrl = optionalHttpsUrl(body.contentUrl);
      const textContent = optionalText(body.textContent, 20000);
      const rawSha = optionalText(body.commitSha, 40);

      if (
        contentUrl === false ||
        textContent === false ||
        rawSha === false ||
        (rawSha !== null && !/^[0-9a-f]{7,40}$/i.test(rawSha))
      ) {
        return invalid(reply, 'INVALID_SUBMISSION');
      }

      const result = await academic.submit({
        userId: user.userId,
        activityId: request.params.activityId,
        submission: {
          contentUrl,
          commitSha: rawSha ? rawSha.toLowerCase() : null,
          textContent,
        },
      });

      return sendResult(
        reply,
        result,
        r => ({
          submissionId: r.submissionId,
          attempt: r.attempt,
          isLate: r.isLate,
        }),
        201,
      );
    },
  );

  app.post<{ Params: { submissionId: string }; Body: Body }>(
    '/submissions/:submissionId/review',
    async (request, reply) => {
      const user = await routeActor(request, reply, ['submissionId']);
      if (!user) return reply;

      const body = request.body ?? {};
      const feedback = optionalText(body.feedback, 5000);
      const rawScore = body.score;

      let score: number | null = null;

      if (rawScore !== undefined && rawScore !== null && rawScore !== '') {
        if (
          typeof rawScore !== 'number' ||
          !Number.isFinite(rawScore) ||
          rawScore < 0 ||
          rawScore > 9999 ||
          Number(rawScore.toFixed(2)) !== rawScore
        ) {
          return invalid(reply, 'INVALID_SCORE');
        }
        score = rawScore;
      }

      if (feedback === false || (feedback === null && score === null)) {
        return invalid(reply, 'INVALID_REVIEW');
      }

      const result = await academic.reviewSubmission({
        actorUserId: user.userId,
        submissionId: request.params.submissionId,
        feedback,
        score,
      });

      return sendResult(reply, result, () => ({ status: 'REVIEWED' }));
    },
  );
}
