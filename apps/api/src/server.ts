import { Pool } from 'pg';
import type {
  IncomingMessage,
  ServerResponse,
} from 'node:http';

import {
  createAcademicRepository,
  createAdminRepository,
  createAuthRepository,
  createInstitutionAccessRepository,
  createPlatformRepository,
} from '@classroom/database';
import { createGitHubAuth } from '@classroom/github';
import { databaseUrl } from '@classroom/shared';

import { createApp } from './app.js';

const requiredEnvironmentNames = [
  'DATABASE_URL',
  'AUTH_GITHUB_CLIENT_ID',
  'AUTH_GITHUB_CLIENT_SECRET',
  'AUTH_GITHUB_CALLBACK_URL',
  'FRONTEND_ORIGIN',
] as const;

type RequiredEnvironmentName =
  (typeof requiredEnvironmentNames)[number];

function requiredEnvironment(name: RequiredEnvironmentName): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

const missingEnvironment = requiredEnvironmentNames.filter(
  name => !process.env[name]?.trim(),
);

let app: ReturnType<typeof createApp>;

if (missingEnvironment.length > 0) {
  app = createApp();

  app.get('/me', async (_request, reply) =>
    reply.code(503).send({
      error: 'SERVICE_CONFIGURATION_REQUIRED',
    }),
  );

  app.get('/auth/github', async (_request, reply) =>
    reply.code(503).send({
      error: 'SERVICE_CONFIGURATION_REQUIRED',
    }),
  );

  app.get('/auth/github/callback', async (_request, reply) =>
    reply.code(503).send({
      error: 'SERVICE_CONFIGURATION_REQUIRED',
    }),
  );

  app.post('/auth/logout', async (_request, reply) =>
    reply.code(503).send({
      error: 'SERVICE_CONFIGURATION_REQUIRED',
    }),
  );
} else {
  const pool = new Pool({
    connectionString: databaseUrl(
      requiredEnvironment('DATABASE_URL'),
    ),
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
    statement_timeout: 5000,
    query_timeout: 6000,
  });

  const auth = createAuthRepository(pool);
  const access = createInstitutionAccessRepository(pool);
  const admin = createAdminRepository(pool);
  const academic = createAcademicRepository(pool);
  const platform = createPlatformRepository(pool);

  const githubAuth = createGitHubAuth({
    clientId: requiredEnvironment('AUTH_GITHUB_CLIENT_ID'),
    clientSecret: requiredEnvironment('AUTH_GITHUB_CLIENT_SECRET'),
    callbackUrl: requiredEnvironment('AUTH_GITHUB_CALLBACK_URL'),
  });

  app = createApp({
    auth,
    access,
    admin,
    academic,
    platform,
    platformAdminGithubIds: (process.env.PLATFORM_ADMIN_GITHUB_IDS ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean),
    githubAuth,
    frontendOrigin: requiredEnvironment('FRONTEND_ORIGIN'),
    secureCookies:
      process.env.VERCEL_ENV === 'production' ||
      process.env.NODE_ENV === 'production',
    checkReadiness: async () => {
      await pool.query('SELECT 1');
      return true;
    },
  });
}

/*
 * Vercel Functions own the HTTP listener. Starting Fastify with `listen()`
 * inside a Function leaves its request lifecycle detached from Vercel's
 * invocation and can cause requests to hang. Prepare Fastify once, then
 * delegate each Vercel request to its underlying Node server.
 */
await app.ready();

export default function handler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  app.server.emit('request', request, response);
}
