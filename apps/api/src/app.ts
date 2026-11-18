import Fastify from 'fastify';
import type {
  createAdminRepository,
  createAuthRepository,
  createInstitutionAccessRepository,
} from '@classroom/database';
import type { createGitHubAuth } from '@classroom/github';

import {
  SESSION_COOKIE,
  OAUTH_COOKIE,
  createOAuthSecrets,
  encodeOAuthCookie,
  decodeOAuthCookie,
  readCookie,
  serializeCookie,
  clearCookie,
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
  githubAuth: GitHubAuth;
  frontendOrigin: string;
  secureCookies: boolean;
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
    githubAuth,
    secureCookies,
  } = dependencies;

  const frontendOrigin = normalizeOrigin(dependencies.frontendOrigin);

  async function sessionUser(cookieHeader: string | undefined) {
    const secret = readCookie(cookieHeader, SESSION_COOKIE);

    return validOpaqueToken(secret)
      ? auth.findSession(secret)
      : null;
  }

  app.setErrorHandler((error, _request, reply) => {
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
        error.message === 'ADMIN_STORAGE_UNAVAILABLE'
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

  app.get('/auth/github', async (_request, reply) => {
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
  }>(
    '/admin/institutions/:institutionId/access-requests',
    async (request, reply) => {
      const { institutionId } = request.params;

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

    reply.header(
      'set-cookie',
      clearCookie(SESSION_COOKIE, secureCookies),
    );

    return reply.code(204).send();
  });

  return app;
}
