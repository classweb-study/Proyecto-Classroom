import Fastify, {
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import type {
  createAcademicRepository,
  createAdminRepository,
  createAuthRepository,
  createInstitutionAccessRepository,
  createPlatformRepository,
} from '@classroom/database';
import type { createGitHubAuth } from '@classroom/github';

import { registerAcademicRoutes } from './academic-routes.js';

import {
  SESSION_COOKIE,
  OAUTH_COOKIE,
  createOAuthSecrets,
  encodeOAuthCookie,
  decodeOAuthCookie,
  readCookie,
  serializeCookie,
  clearCookie,
  ACCOUNT_PICKER_COOKIE,
  validState,
  validOAuthCode,
  validOpaqueToken,
  validOrigin,
} from './auth-http.js';

type AuthRepository = ReturnType<typeof createAuthRepository>;
type InstitutionAccessRepository = ReturnType<
  typeof createInstitutionAccessRepository
>;
type AdminRepository = ReturnType<typeof createAdminRepository>;
type GitHubAuth = ReturnType<typeof createGitHubAuth>;

const liveness = { status: 'alive' as const, scope: 'process' as const };

export interface AppDependencies {
  auth: AuthRepository;
  access: InstitutionAccessRepository;
  admin: AdminRepository;
  /** Courses, activities and submissions; routes exist only when supplied. */
  academic?: ReturnType<typeof createAcademicRepository>;
  /** Institution creation; routes exist only when supplied. */
  platform?: ReturnType<typeof createPlatformRepository>;
  /**
   * GitHub user ids (numeric, as strings) allowed to create institutions.
   * Configured by deployment, never through the product, so nobody can
   * grant themselves platform powers. Empty means nobody.
   */
  platformAdminGithubIds?: string[];
  githubAuth: GitHubAuth;
  frontendOrigin: string;
  secureCookies: boolean;
  /** Dependency probe; its result is intentionally separate from liveness. */
  checkReadiness?: () => Promise<boolean>;
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function optionalHttpsUrl(value: unknown): string | null | false {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) return false;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.toString()
      : false;
  } catch {
    return false;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function boundedText(
  value: unknown,
  min: number,
  max: number,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length >= min && trimmed.length <= max
    ? trimmed
    : null;
}

function validEmail(value: unknown): string | null {
  const email = boundedText(value, 3, 254);

  return email && EMAIL_PATTERN.test(email)
    ? email.toLowerCase()
    : null;
}

const DOMAIN_PATTERN =
  /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const ADMIN_RESULT_ERRORS: Record<string, [number, string]> = {
  FORBIDDEN: [403, 'FORBIDDEN'],
  NOT_FOUND: [404, 'NOT_FOUND'],
  SELF: [409, 'CANNOT_MODIFY_OWN_MEMBERSHIP'],
  STALE_MEMBERSHIP: [409, 'STALE_MEMBERSHIP'],
  SAME_ROLE: [409, 'ROLE_UNCHANGED'],
  DUPLICATE: [409, 'DOMAIN_ALREADY_EXISTS'],
};

function sendAdminResult<T extends { status: string }>(
  reply: FastifyReply,
  result: T,
  body: (result: Extract<T, { status: 'OK' }>) => unknown,
  successCode = 200,
) {
  if (result.status !== 'OK') {
    const [code, error] = ADMIN_RESULT_ERRORS[result.status] ?? [
      500,
      'INTERNAL_ERROR',
    ];

    return reply.code(code).send({ error });
  }

  return reply
    .code(successCode)
    .send(body(result as Extract<T, { status: 'OK' }>));
}

function isAccessRole(
  value: unknown,
): value is 'TEACHER' | 'STUDENT' {
  return value === 'TEACHER' || value === 'STUDENT';
}

function validUuid(value: string | undefined): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  const loopback =
    url.hostname === '127.0.0.1' ||
    url.hostname === 'localhost';

  if (
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.origin === 'null'
  ) {
    throw new Error('FRONTEND_ORIGIN_INVALID');
  }

  return url.origin;
}

export function createApp(dependencies?: AppDependencies) {
  const app = Fastify({ logger: false });

  app.get('/health/live', async () => liveness);

  app.get('/health/ready', async (_request, reply) => {
    if (!dependencies?.checkReadiness) {
      return reply.code(503).send({
        status: 'unavailable',
        scope: 'configuration',
      });
    }

    try {
      if (await dependencies.checkReadiness()) {
        return { status: 'ready' as const, scope: 'dependencies' as const };
      }
    } catch {
      // Keep infrastructure details in protected runtime logs.
    }

    return reply.code(503).send({
      status: 'unavailable',
      scope: 'dependencies',
    });
  });

  /*
   * Keeping dependencies optional preserves the process-liveness app used
   * by existing infrastructure checks. Auth routes only exist when the
   * product auth dependencies are explicitly supplied.
   */
  if (!dependencies) {
    return app;
  }

  const {
    auth,
    access,
    admin,
    academic,
    platform,
    githubAuth,
    secureCookies,
  } = dependencies;

  // A deployment with ambiguous ownership must not elevate multiple accounts.
  const configuredOwners = dependencies.platformAdminGithubIds ?? [];
  const platformOwner = configuredOwners.length === 1 ? configuredOwners[0] : undefined;

  function isPlatformAdmin(user: { githubUserId: bigint }) {
    return platformOwner === user.githubUserId.toString();
  }

  const frontendOrigin = normalizeOrigin(dependencies.frontendOrigin);

  async function sessionUser(cookieHeader: string | undefined) {
    const secret = readCookie(cookieHeader, SESSION_COOKIE);

    return validOpaqueToken(secret)
      ? auth.findSession(secret)
      : null;
  }

  async function adminRouteActor(
    request: FastifyRequest<{ Params: Record<string, string> }>,
    reply: FastifyReply,
    idParams: string[],
  ) {
    const mutation = request.method !== 'GET';

    if (
      mutation &&
      !validOrigin(request.headers.origin, frontendOrigin)
    ) {
      reply.code(403).send({ error: 'ORIGIN_FORBIDDEN' });
      return null;
    }

    if (!idParams.every(name => validUuid(request.params[name]))) {
      reply.code(400).send({ error: 'INVALID_REQUEST' });
      return null;
    }

    const user = await sessionUser(request.headers.cookie);

    if (!user) {
      reply.code(401).send({ error: 'UNAUTHENTICATED' });
      return null;
    }

    return user;
  }

  app.addHook('preHandler', async (request, reply) => {
    const path = request.routeOptions.url ?? '';
    const ownerRestricted = path.startsWith('/admin/') ||
      (request.method === 'POST' && path === '/me/access-requests');
    if (platformOwner && ownerRestricted) {
      const user = await sessionUser(request.headers.cookie);
      if (user && isPlatformAdmin(user)) return reply.code(403).send({error:'FORBIDDEN'});
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && error.message === 'ROLE_CONFLICT') {
      return reply.code(409).send({error:'ROLE_CONFLICT'});
    }
    if (
      error instanceof Error &&
      error.message === 'AUTH_STORAGE_UNAVAILABLE'
    ) {
      return reply.code(503).send({
        error: 'AUTH_UNAVAILABLE',
      });
    }

    if (
      error instanceof Error &&
      (
        error.message === 'ACCESS_STORAGE_UNAVAILABLE' ||
        error.message === 'ADMIN_STORAGE_UNAVAILABLE' ||
        error.message === 'ACADEMIC_STORAGE_UNAVAILABLE' ||
        error.message === 'PLATFORM_STORAGE_UNAVAILABLE'
      )
    ) {
      return reply.code(503).send({
        error: 'SERVICE_UNAVAILABLE',
      });
    }

    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
    });
  });

  app.get('/auth/github', async (request, reply) => {
    const {
      state,
      binding,
      verifier,
      challenge,
    } = createOAuthSecrets();

    await auth.createOAuthAttempt(state, binding);

    const authorizationUrl = githubAuth.createAuthorizationUrl({
      state,
      challenge,
      selectAccount: readCookie(request.headers.cookie, ACCOUNT_PICKER_COOKIE) === '1',
    });

    reply.header(
      'set-cookie',
      serializeCookie(
        OAUTH_COOKIE,
        encodeOAuthCookie(binding, verifier),
        {
          secure: secureCookies,
          path: '/auth/github/callback',
          maxAge: 10 * 60,
        },
      ),
    );

    return reply.redirect(authorizationUrl);
  });

  app.get<{
    Querystring: {
      code?: string;
      state?: string;
      error?: string;
    };
  }>('/auth/github/callback', async (request, reply) => {
    const clearOAuth = clearCookie(
      OAUTH_COOKIE,
      secureCookies,
      '/auth/github/callback',
    );

    /*
     * The provider may return an OAuth error instead of a code.
     * Do not reflect provider-controlled error text back to the browser.
     */
    if (request.query.error) {
      reply.header('set-cookie', clearOAuth);
      return reply.code(400).send({
        error: 'GITHUB_AUTHORIZATION_FAILED',
      });
    }

    const { state, code } = request.query;

    if (!validState(state) || !validOAuthCode(code)) {
      reply.header('set-cookie', clearOAuth);
      return reply.code(400).send({
        error: 'OAUTH_CALLBACK_INVALID',
      });
    }

    const oauthCookie = decodeOAuthCookie(
      readCookie(request.headers.cookie, OAUTH_COOKIE),
    );

    if (!oauthCookie) {
      reply.header('set-cookie', clearOAuth);
      return reply.code(400).send({
        error: 'OAUTH_CALLBACK_INVALID',
      });
    }

    /*
     * Claim the state before provider I/O.
     * Replays and concurrent callbacks therefore fail closed.
     */
    const consumed = await auth.consumeOAuthAttempt(
      state,
      oauthCookie.binding,
    );

    if (!consumed) {
      reply.header('set-cookie', clearOAuth);
      return reply.code(400).send({
        error: 'OAUTH_CALLBACK_INVALID',
      });
    }

    let identity;

    try {
      identity = await githubAuth.exchangeCode({
        code,
        verifier: oauthCookie.verifier,
      });
    } catch {
      reply.header('set-cookie', clearOAuth);
      return reply.code(502).send({
        error: 'GITHUB_AUTHENTICATION_FAILED',
      });
    }

    const user = await auth.resolveGitHubIdentity({
      githubUserId: identity.id,
      login: identity.login,
      avatarUrl: identity.avatarUrl,
    });

    const session = await auth.createSession(user.userId);

    reply.header('set-cookie', [
      clearOAuth,
      clearCookie(ACCOUNT_PICKER_COOKIE, secureCookies, '/auth/github'),
      serializeCookie(SESSION_COOKIE, session.secret, {
        secure: secureCookies,
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
        expires: session.expiresAt,
      }),
    ]);

    return reply.redirect(`${frontendOrigin}/`);
  });

  app.get('/me', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const secret = readCookie(
      request.headers.cookie,
      SESSION_COOKIE,
    );

    if (!validOpaqueToken(secret)) {
      if (secret) {
        reply.header(
          'set-cookie',
          clearCookie(SESSION_COOKIE, secureCookies),
        );
      }

      return reply.code(401).send({
        error: 'UNAUTHENTICATED',
      });
    }

    const user = await auth.findSession(secret);

    if (!user) {
      reply.header(
        'set-cookie',
        clearCookie(SESSION_COOKIE, secureCookies),
      );

      return reply.code(401).send({
        error: 'UNAUTHENTICATED',
      });
    }

    const institutions = await auth.getUserAccessContext(
      user.userId,
    );

    /*
     * BigInt is deliberately converted to a string at the HTTP boundary.
     * GitHub login is presentation data, not the stable external key.
     */
    return {
      user: {
        id: user.userId,
        github: {
          id: user.githubUserId.toString(),
          login: user.login,
          avatarUrl: user.avatarUrl,
        },
        academicIdentity: null,
        isPlatformAdmin: isPlatformAdmin(user),
        institutions,
      },
    };
  });

  app.get<{
    Querystring: {
      q?: string;
    };
  }>('/institutions', async (request, reply) => {
    const user = await sessionUser(request.headers.cookie);

    if (!user) {
      return reply.code(401).send({
        error: 'UNAUTHENTICATED',
      });
    }

    const query = request.query.q ?? '';

    if (typeof query !== 'string' || query.length > 100) {
      return reply.code(400).send({
        error: 'INVALID_QUERY',
      });
    }

    return {
      institutions: await access.searchInstitutions(
        query.trim(),
      ),
    };
  });

  app.get('/me/access-requests', async (request, reply) => {
    const user = await sessionUser(request.headers.cookie);

    if (!user) {
      return reply.code(401).send({
        error: 'UNAUTHENTICATED',
      });
    }

    return {
      requests: await access.listMyAccessRequests(user.userId),
    };
  });

  app.post<{
    Body: Record<string, unknown> | undefined;
  }>('/me/access-requests', async (request, reply) => {
    if (!validOrigin(request.headers.origin, frontendOrigin)) {
      return reply.code(403).send({
        error: 'ORIGIN_FORBIDDEN',
      });
    }

    const user = await sessionUser(request.headers.cookie);

    if (!user) {
      return reply.code(401).send({
        error: 'UNAUTHENTICATED',
      });
    }

    const body = request.body ?? {};
    const institutionId = body.institutionId;
    const requestedRole = body.requestedRole;
    const fullName = boundedText(body.fullName, 2, 120);
    const contactEmail = validEmail(body.contactEmail);
    const requestReason = boundedText(body.requestReason, 1, 1000);

    const rawInstitutionalEmail = body.institutionalEmail;
    const institutionalEmail =
      rawInstitutionalEmail === undefined ||
      rawInstitutionalEmail === null ||
      rawInstitutionalEmail === ''
        ? null
        : validEmail(rawInstitutionalEmail);

    const rawInstitutionalCode = body.institutionalCode;
    const institutionalCode =
      rawInstitutionalCode === undefined ||
      rawInstitutionalCode === null ||
      rawInstitutionalCode === ''
        ? null
        : boundedText(rawInstitutionalCode, 1, 40);

    if (
      typeof institutionId !== 'string' ||
      !validUuid(institutionId) ||
      !isAccessRole(requestedRole) ||
      !fullName ||
      !contactEmail ||
      !requestReason ||
      (rawInstitutionalEmail && !institutionalEmail) ||
      (rawInstitutionalCode && !institutionalCode)
    ) {
      return reply.code(400).send({
        error: 'INVALID_ACCESS_REQUEST',
      });
    }

    const result = await access.submitAccessRequest({
      userId: user.userId,
      institutionId,
      requestedRole,
      fullName,
      contactEmail,
      institutionalEmail,
      institutionalCode,
      requestReason,
    });

    switch (result.status) {
      case 'INSTITUTION_NOT_FOUND':
        return reply.code(404).send({
          error: 'INSTITUTION_NOT_FOUND',
        });
      case 'ALREADY_MEMBER':
        return reply.code(409).send({
          error: 'ALREADY_MEMBER',
        });
      case 'PENDING_EXISTS':
        return reply.code(409).send({
          error: 'ACCESS_REQUEST_PENDING_EXISTS',
        });
      case 'CREATED':
        return reply.code(201).send({
          requestId: result.requestId,
        });
    }
  });

  app.post<{
    Params: {
      requestId: string;
    };
  }>(
    '/me/access-requests/:requestId/cancel',
    async (request, reply) => {
      if (!validOrigin(request.headers.origin, frontendOrigin)) {
        return reply.code(403).send({
          error: 'ORIGIN_FORBIDDEN',
        });
      }

      const { requestId } = request.params;

      if (!validUuid(requestId)) {
        return reply.code(400).send({
          error: 'INVALID_REQUEST',
        });
      }

      const user = await sessionUser(request.headers.cookie);

      if (!user) {
        return reply.code(401).send({
          error: 'UNAUTHENTICATED',
        });
      }

      const result = await access.cancelAccessRequest(
        user.userId,
        requestId,
      );

      if (result.status === 'NOT_FOUND') {
        return reply.code(404).send({
          error: 'ACCESS_REQUEST_NOT_FOUND',
        });
      }

      if (result.status === 'ALREADY_DECIDED') {
        return reply.code(409).send({
          error: 'ACCESS_REQUEST_ALREADY_DECIDED',
        });
      }

      return { status: 'CANCELLED' };
    },
  );

  app.get<{
    Params: {
      institutionId: string;
    };
    Querystring: {
      status?: string;
    };
  }>(
    '/admin/institutions/:institutionId/access-requests',
    async (request, reply) => {
      const { institutionId } = request.params;
      const status = request.query.status ?? 'PENDING';

      if (
        status !== 'PENDING' &&
        status !== 'APPROVED' &&
        status !== 'DENIED' &&
        status !== 'CANCELLED'
      ) {
        return reply.code(400).send({
          error: 'INVALID_STATUS',
        });
      }

      if (!validUuid(institutionId)) {
        return reply.code(400).send({
          error: 'INVALID_INSTITUTION_ID',
        });
      }

      const secret = readCookie(
        request.headers.cookie,
        SESSION_COOKIE,
      );

      if (!validOpaqueToken(secret)) {
        return reply.code(401).send({
          error: 'UNAUTHENTICATED',
        });
      }

      const user = await auth.findSession(secret);

      if (!user) {
        return reply.code(401).send({
          error: 'UNAUTHENTICATED',
        });
      }

      const result = await admin.listPendingAccessRequests(
        user.userId,
        institutionId,
        status,
      );

      if (result.status === 'FORBIDDEN') {
        return reply.code(403).send({
          error: 'FORBIDDEN',
        });
      }

      return {
        requests: result.requests,
      };
    },
  );

  app.get<{
    Params: {
      institutionId: string;
    };
    Querystring: {
      role?: string;
    };
  }>(
    '/admin/institutions/:institutionId/members',
    async (request, reply) => {
      const { institutionId } = request.params;
      const role = request.query.role;

      if (!validUuid(institutionId)) {
        return reply.code(400).send({
          error: 'INVALID_INSTITUTION_ID',
        });
      }

      if (role !== 'TEACHER' && role !== 'STUDENT') {
        return reply.code(400).send({
          error: 'INVALID_ROLE',
        });
      }

      const secret = readCookie(
        request.headers.cookie,
        SESSION_COOKIE,
      );

      if (!validOpaqueToken(secret)) {
        return reply.code(401).send({
          error: 'UNAUTHENTICATED',
        });
      }

      const user = await auth.findSession(secret);

      if (!user) {
        return reply.code(401).send({
          error: 'UNAUTHENTICATED',
        });
      }

      const result = await admin.listInstitutionMembers(
        user.userId,
        institutionId,
        role,
      );

      if (result.status === 'FORBIDDEN') {
        return reply.code(403).send({
          error: 'FORBIDDEN',
        });
      }

      return {
        members: result.members,
      };
    },
  );

  app.post<{
    Params: {
      institutionId: string;
      requestId: string;
    };
    Body: {
      role?: string;
    };
  }>(
    '/admin/institutions/:institutionId/access-requests/:requestId/approve',
    async (request, reply) => {
      if (
        !validOrigin(
          request.headers.origin,
          frontendOrigin,
        )
      ) {
        return reply.code(403).send({
          error: 'ORIGIN_FORBIDDEN',
        });
      }

      const { institutionId, requestId } = request.params;

      if (
        !validUuid(institutionId) ||
        !validUuid(requestId)
      ) {
        return reply.code(400).send({
          error: 'INVALID_REQUEST',
        });
      }

      const role = request.body?.role;

      if (role !== 'TEACHER' && role !== 'STUDENT') {
        return reply.code(400).send({
          error: 'INVALID_ROLE',
        });
      }

      const secret = readCookie(
        request.headers.cookie,
        SESSION_COOKIE,
      );

      if (!validOpaqueToken(secret)) {
        return reply.code(401).send({
          error: 'UNAUTHENTICATED',
        });
      }

      const user = await auth.findSession(secret);

      if (!user) {
        return reply.code(401).send({
          error: 'UNAUTHENTICATED',
        });
      }

      const result = await admin.approveAccessRequest({
        actorUserId: user.userId,
        institutionId,
        requestId,
        role,
      });

      if (result.status === 'FORBIDDEN') {
        return reply.code(403).send({
          error: 'FORBIDDEN',
        });
      }

      if (result.status === 'NOT_FOUND') {
        return reply.code(404).send({
          error: 'ACCESS_REQUEST_NOT_FOUND',
        });
      }

      if (result.status === 'ALREADY_DECIDED') {
        return reply.code(409).send({
          error: 'ACCESS_REQUEST_ALREADY_DECIDED',
        });
      }

      return {
        decision: result,
      };
    },
  );

  app.post<{
    Params: {
      institutionId: string;
      requestId: string;
    };
    Body: {
      reason?: unknown;
    };
  }>(
    '/admin/institutions/:institutionId/access-requests/:requestId/deny',
    async (request, reply) => {
      if (
        !validOrigin(
          request.headers.origin,
          frontendOrigin,
        )
      ) {
        return reply.code(403).send({
          error: 'ORIGIN_FORBIDDEN',
        });
      }

      const { institutionId, requestId } = request.params;

      if (
        !validUuid(institutionId) ||
        !validUuid(requestId)
      ) {
        return reply.code(400).send({
          error: 'INVALID_REQUEST',
        });
      }

      const reason = boundedText(request.body?.reason, 1, 500);

      if (!reason) {
        return reply.code(400).send({
          error: 'DENIAL_REASON_REQUIRED',
        });
      }

      const secret = readCookie(
        request.headers.cookie,
        SESSION_COOKIE,
      );

      if (!validOpaqueToken(secret)) {
        return reply.code(401).send({
          error: 'UNAUTHENTICATED',
        });
      }

      const user = await auth.findSession(secret);

      if (!user) {
        return reply.code(401).send({
          error: 'UNAUTHENTICATED',
        });
      }

      const result = await admin.denyAccessRequest({
        actorUserId: user.userId,
        institutionId,
        requestId,
        reason,
      });

      if (result.status === 'FORBIDDEN') {
        return reply.code(403).send({
          error: 'FORBIDDEN',
        });
      }

      if (result.status === 'NOT_FOUND') {
        return reply.code(404).send({
          error: 'ACCESS_REQUEST_NOT_FOUND',
        });
      }

      if (result.status === 'ALREADY_DECIDED') {
        return reply.code(409).send({
          error: 'ACCESS_REQUEST_ALREADY_DECIDED',
        });
      }

      return {
        decision: result,
      };
    },
  );

  app.patch<{
    Params: { institutionId: string; requestId: string };
    Body: { fullName?: unknown; contactEmail?: unknown; institutionalCode?: unknown };
  }>('/admin/institutions/:institutionId/access-requests/:requestId/applicant', async (request, reply) => {
    const actor = await adminRouteActor(request, reply, ['institutionId', 'requestId']);
    if (!actor) return reply;

    const fullName = boundedText(request.body?.fullName, 2, 120);
    const contactEmail = validEmail(request.body?.contactEmail);
    const institutionalCode = boundedText(request.body?.institutionalCode, 1, 40);
    if (!fullName || !contactEmail || !institutionalCode) {
      return reply.code(400).send({ error: 'INVALID_APPLICANT' });
    }

    const result = await admin.updateApplicant({
      actorUserId: actor.userId, ...request.params, fullName, contactEmail, institutionalCode,
    });
    return sendAdminResult(reply, result, () => ({ saved: true }));
  });

  app.get<{ Params: { institutionId: string } }>('/admin/institutions/:institutionId/removed-members', async (request, reply) => {
    const actor = await adminRouteActor(request, reply, ['institutionId']);
    if (!actor) return reply;
    const result = await admin.listRemovedMembers(actor.userId, request.params.institutionId);
    return sendAdminResult(reply, result, value => ({ members: value.members }));
  });

  app.post<{ Params: { institutionId: string; membershipId: string } }>(
    '/admin/institutions/:institutionId/members/:membershipId/restore', async (request, reply) => {
      const actor = await adminRouteActor(request, reply, ['institutionId', 'membershipId']);
      if (!actor) return reply;
      const result = await admin.restoreMembership(actor.userId, request.params.institutionId, request.params.membershipId);
      return sendAdminResult(reply, result, () => ({ restored: true }));
    },
  );

  app.get<{ Params: { institutionId: string } }>(
    '/admin/institutions/:institutionId',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, [
        'institutionId',
      ]);

      if (!user) return reply;

      const result = await admin.getInstitutionOverview(
        user.userId,
        request.params.institutionId,
      );

      return sendAdminResult(reply, result, overview => ({
        institution: overview.institution,
        domains: overview.domains,
        counts: overview.counts,
      }));
    },
  );

  app.patch<{
    Params: { institutionId: string };
    Body:
      | {
          name?: unknown;
          description?: unknown;
          logoUrl?: unknown;
          accentColor?: unknown;
        }
      | undefined;
  }>(
    '/admin/institutions/:institutionId',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, [
        'institutionId',
      ]);

      if (!user) return reply;

      const name = boundedText(request.body?.name, 2, 120);
      const rawDescription = request.body?.description;
      const description =
        rawDescription === undefined ||
        rawDescription === null ||
        rawDescription === ''
          ? null
          : boundedText(rawDescription, 1, 2000);

      const logoUrl = optionalHttpsUrl(request.body?.logoUrl);
      const rawAccent = request.body?.accentColor;
      const accentColor =
        rawAccent === undefined || rawAccent === null || rawAccent === ''
          ? null
          : typeof rawAccent === 'string' &&
              HEX_COLOR_PATTERN.test(rawAccent)
            ? rawAccent.toLowerCase()
            : false;

      if (
        !name ||
        (rawDescription && !description) ||
        logoUrl === false ||
        accentColor === false
      ) {
        return reply.code(400).send({
          error: 'INVALID_INSTITUTION',
        });
      }

      const result = await admin.updateInstitution({
        actorUserId: user.userId,
        institutionId: request.params.institutionId,
        name,
        description,
        logoUrl,
        accentColor,
      });

      return sendAdminResult(reply, result, () => ({
        status: 'UPDATED',
      }));
    },
  );

  app.post<{
    Params: { institutionId: string };
    Body: { domain?: unknown } | undefined;
  }>(
    '/admin/institutions/:institutionId/domains',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, [
        'institutionId',
      ]);

      if (!user) return reply;

      const raw = request.body?.domain;
      const domain =
        typeof raw === 'string'
          ? raw.trim().toLowerCase().replace(/^@/, '')
          : '';

      if (!DOMAIN_PATTERN.test(domain)) {
        return reply.code(400).send({
          error: 'INVALID_DOMAIN',
        });
      }

      const result = await admin.addInstitutionDomain({
        actorUserId: user.userId,
        institutionId: request.params.institutionId,
        domain,
      });

      return sendAdminResult(
        reply,
        result,
        added => ({ domain: added.domain }),
        201,
      );
    },
  );

  app.delete<{
    Params: { institutionId: string; domainId: string };
  }>(
    '/admin/institutions/:institutionId/domains/:domainId',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, [
        'institutionId',
        'domainId',
      ]);

      if (!user) return reply;

      const result = await admin.removeInstitutionDomain({
        actorUserId: user.userId,
        institutionId: request.params.institutionId,
        domainId: request.params.domainId,
      });

      return sendAdminResult(reply, result, () => ({
        status: 'REMOVED',
      }));
    },
  );

  app.post<{
    Params: { institutionId: string; membershipId: string };
  }>(
    '/admin/institutions/:institutionId/members/:membershipId/revoke',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, [
        'institutionId',
        'membershipId',
      ]);

      if (!user) return reply;

      const result = await admin.revokeMembership({
        actorUserId: user.userId,
        institutionId: request.params.institutionId,
        membershipId: request.params.membershipId,
      });

      return sendAdminResult(reply, result, () => ({
        status: 'REVOKED',
      }));
    },
  );

  app.post<{
    Params: { institutionId: string; membershipId: string };
    Body: { role?: unknown } | undefined;
  }>(
    '/admin/institutions/:institutionId/members/:membershipId/role',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, [
        'institutionId',
        'membershipId',
      ]);

      if (!user) return reply;

      const role = request.body?.role;

      if (!isAccessRole(role)) {
        return reply.code(400).send({ error: 'INVALID_ROLE' });
      }

      const result = await admin.changeMembershipRole({
        actorUserId: user.userId,
        institutionId: request.params.institutionId,
        membershipId: request.params.membershipId,
        role,
      });

      return sendAdminResult(reply, result, () => ({
        status: 'ROLE_CHANGED',
        role,
      }));
    },
  );

  app.get<{ Params: { institutionId: string } }>(
    '/admin/institutions/:institutionId/audit-log',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, [
        'institutionId',
      ]);

      if (!user) return reply;

      const result = await admin.listAuditLog(
        user.userId,
        request.params.institutionId,
      );

      return sendAdminResult(reply, result, log => ({
        entries: log.entries,
      }));
    },
  );

  app.get<{ Params: { requestId: string } }>(
    '/me/access-requests/:requestId/messages',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, ['requestId']);

      if (!user) return reply;

      const result = await access.listMyRequestMessages(
        user.userId,
        request.params.requestId,
      );

      return sendAdminResult(reply, result, r => ({
        messages: r.messages,
      }));
    },
  );

  app.post<{
    Params: { requestId: string };
    Body: { body?: unknown } | undefined;
  }>(
    '/me/access-requests/:requestId/messages',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, ['requestId']);

      if (!user) return reply;

      const body = boundedText(request.body?.body, 1, 2000);

      if (!body) {
        return reply.code(400).send({ error: 'INVALID_MESSAGE' });
      }

      const result = await access.postMyRequestMessage(
        user.userId,
        request.params.requestId,
        body,
      );

      return sendAdminResult(
        reply,
        result,
        () => ({ status: 'SENT' }),
        201,
      );
    },
  );

  app.get<{ Params: { institutionId: string; requestId: string } }>(
    '/admin/institutions/:institutionId/access-requests/:requestId/messages',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, [
        'institutionId',
        'requestId',
      ]);

      if (!user) return reply;

      const result = await admin.listRequestMessages({
        actorUserId: user.userId,
        institutionId: request.params.institutionId,
        requestId: request.params.requestId,
      });

      return sendAdminResult(reply, result, r => ({
        messages: r.messages,
      }));
    },
  );

  app.post<{
    Params: { institutionId: string; requestId: string };
    Body: { body?: unknown } | undefined;
  }>(
    '/admin/institutions/:institutionId/access-requests/:requestId/messages',
    async (request, reply) => {
      const user = await adminRouteActor(request, reply, [
        'institutionId',
        'requestId',
      ]);

      if (!user) return reply;

      const body = boundedText(request.body?.body, 1, 2000);

      if (!body) {
        return reply.code(400).send({ error: 'INVALID_MESSAGE' });
      }

      const result = await admin.postRequestMessage({
        actorUserId: user.userId,
        institutionId: request.params.institutionId,
        requestId: request.params.requestId,
        body,
      });

      return sendAdminResult(
        reply,
        result,
        () => ({ status: 'SENT' }),
        201,
      );
    },
  );

  if (platform) {
    async function platformActor(
      request: FastifyRequest<{ Params: Record<string, string> }>,
      reply: FastifyReply,
      idParams: string[],
    ) {
      const user = await adminRouteActor(request, reply, idParams);

      if (!user) return null;

      if (!isPlatformAdmin(user)) {
        reply.code(403).send({ error: 'FORBIDDEN' });
        return null;
      }

      return user;
    }

    app.get('/platform/institutions', async (request, reply) => {
      const user = await platformActor(request as never, reply, []);

      if (!user) return reply;

      return { institutions: await platform.listInstitutions() };
    });

    app.post<{
      Body:
        | { name?: unknown; slug?: unknown }
        | undefined;
    }>('/platform/institutions', async (request, reply) => {
      const user = await platformActor(request as never, reply, []);

      if (!user) return reply;

      const name = boundedText(request.body?.name, 2, 120);
      const slug =
        typeof request.body?.slug === 'string'
          ? request.body.slug.trim().toLowerCase()
          : '';
      if (!name || !SLUG_PATTERN.test(slug)) {
        return reply.code(400).send({ error: 'INVALID_INSTITUTION' });
      }

      const result = await platform.createInstitution({
        actorUserId: user.userId,
        name,
        slug,
      });

      if (result.status === 'DUPLICATE') {
        return reply.code(409).send({ error: 'SLUG_ALREADY_EXISTS' });
      }

      return reply
        .code(201)
        .send({ institutionId: result.institutionId });
    });

    app.delete<{Params: {institutionId:string}}>('/platform/institutions/:institutionId', async (request, reply) => {
      const user = await platformActor(request, reply, ['institutionId']);
      if (!user) return reply;
      return await platform.removeInstitution(user.userId, request.params.institutionId)
        ? {status:'REMOVED'} : reply.code(404).send({error:'NOT_FOUND'});
    });

    app.get('/me/admin-requests', async (request, reply) => {
      const user = await adminRouteActor(request as never, reply, []);
      if (!user) return reply;
      return { requests: await platform.listRequests(user.userId) };
    });

    app.post<{Params: {institutionId: string}}>('/me/admin-requests/:institutionId', async (request, reply) => {
      const user = await adminRouteActor(request, reply, ['institutionId']);
      if (!user) return reply;
      if (isPlatformAdmin(user)) return reply.code(403).send({error: 'FORBIDDEN'});
      const created = await platform.requestAdmin(user.userId, request.params.institutionId);
      return created ? reply.code(201).send({status:'PENDING'}) : reply.code(409).send({error:'REQUEST_UNAVAILABLE'});
    });

    app.get('/platform/admin-requests', async (request, reply) => {
      if (!await platformActor(request as never, reply, [])) return reply;
      return {requests: await platform.listRequests(null)};
    });

    app.post<{Params: {id: string}; Body: {decision?: string}}>('/platform/admin-requests/:id', async (request, reply) => {
      const user = await platformActor(request, reply, ['id']);
      if (!user) return reply;
      const decision = request.body?.decision;
      if (decision !== 'APPROVED' && decision !== 'DENIED') return reply.code(400).send({error:'INVALID_DECISION'});
      const changed = await platform.decideRequest(user.userId, request.params.id, decision === 'APPROVED');
      return changed ? {status:decision} : reply.code(409).send({error:'ALREADY_DECIDED'});
    });

    app.get('/platform/admin-history', async (request, reply) => {
      if (!await platformActor(request as never, reply, [])) return reply;
      return {events: await platform.listAdminHistory()};
    });

  }

  if (academic) {
    registerAcademicRoutes(app, academic, adminRouteActor);
  }

  app.post('/auth/logout', async (request, reply) => {
    if (
      !validOrigin(
        request.headers.origin,
        frontendOrigin,
      )
    ) {
      return reply.code(403).send({
        error: 'ORIGIN_FORBIDDEN',
      });
    }

    const secret = readCookie(
      request.headers.cookie,
      SESSION_COOKIE,
    );

    if (validOpaqueToken(secret)) {
      await auth.revokeSession(secret);
    }

    reply.header('set-cookie', [
      clearCookie(SESSION_COOKIE, secureCookies),
      clearCookie(OAUTH_COOKIE, secureCookies, '/auth/github/callback'),
      serializeCookie(ACCOUNT_PICKER_COOKIE, '1', {
        secure: secureCookies, path: '/auth/github', maxAge: 365 * 24 * 60 * 60,
      }),
    ]);

    return reply.code(204).send();
  });

  return app;
}
