import { describe, expect, it } from 'vitest';

import {
  accessViewFor,
  classifyMeResponse,
  emailDomain,
  emailKind,
  isExpiredSession,
  roleName,
  type AccessRequestSummary,
  type CurrentUser,
  type UserInstitution,
} from '../../apps/web/src/session/session-state.js';

const institution = (roles: UserInstitution['roles']): UserInstitution => ({
  id: 'i1',
  name: 'Universidad X',
  slug: 'x',
  roles,
  academicIdentity: null,
});

const request = (status: AccessRequestSummary['status']): AccessRequestSummary => ({
  id: 'r1',
  institution: { id: 'i1', name: 'Universidad X', slug: 'x' },
  status,
  assignedRole: null,
});

const user = (
  institutions: UserInstitution[],
  accessRequest: AccessRequestSummary | null,
): CurrentUser => ({
  id: 'u1',
  github: { id: '1', login: 'ana', avatarUrl: null },
  academicIdentity: null,
  institutions,
  accessRequest,
});

describe('classifyMeResponse', () => {
  it.each([
    [200, 'ok'],
    [204, 'ok'],
    [401, 'anonymous'],
    [403, 'server-error'],
    [500, 'server-error'],
    [503, 'server-error'],
    [null, 'network-error'],
  ] as const)('%s → %s', (status, outcome) => {
    expect(classifyMeResponse(status)).toBe(outcome);
  });
});

describe('isExpiredSession', () => {
  it('un 401 solo es "sesión terminada" si la persona ya estaba dentro', () => {
    expect(isExpiredSession(true, 'anonymous')).toBe(true);
    expect(isExpiredSession(false, 'anonymous')).toBe(false);
    expect(isExpiredSession(true, 'server-error')).toBe(false);
    expect(isExpiredSession(true, 'ok')).toBe(false);
  });
});

describe('accessViewFor (mismo orden de reglas que tenía main.tsx)', () => {
  it('sin institución y con solicitud pendiente → pendiente', () => {
    expect(accessViewFor(user([], request('PENDING'))).kind).toBe('pending');
  });

  it('sin institución y con solicitud denegada → rechazada', () => {
    expect(accessViewFor(user([], request('DENIED'))).kind).toBe('denied');
  });

  it('sin institución y sin solicitud (o con una aprobada sin membresía) → sin institución', () => {
    expect(accessViewFor(user([], null)).kind).toBe('no-institution');
    expect(accessViewFor(user([], request('APPROVED'))).kind).toBe('no-institution');
  });

  it('con institución pero sin rol de administrador → rol sin interfaz', () => {
    expect(accessViewFor(user([institution(['STUDENT'])], null)).kind).toBe('role-unavailable');
    expect(accessViewFor(user([institution(['TEACHER'])], null)).kind).toBe('role-unavailable');
  });

  it('administrador → aplicación; la membresía pesa más que una solicitud vieja', () => {
    expect(accessViewFor(user([institution(['ADMIN'])], null)).kind).toBe('app');
    expect(accessViewFor(user([institution(['ADMIN'])], request('DENIED'))).kind).toBe('app');
    expect(accessViewFor(user([institution(['STUDENT'])], request('PENDING'))).kind).toBe('role-unavailable');
  });
});

describe('correo institucional o personal', () => {
  it('extrae el dominio y rechaza correos mal escritos', () => {
    expect(emailDomain('Ana@Uni.EDU.co')).toBe('uni.edu.co');
    expect(emailDomain('sin-arroba')).toBeNull();
    expect(emailDomain('@uni.edu.co')).toBeNull();
    expect(emailDomain('ana@')).toBeNull();
  });

  it('reconoce el dominio de la institución y sus subdominios', () => {
    expect(emailKind('ana@uni.edu.co', ['uni.edu.co'])).toBe('institutional');
    expect(emailKind('ana@est.uni.edu.co', ['@uni.edu.co'])).toBe('institutional');
    expect(emailKind('ana@otrauni.edu.co', ['uni.edu.co'])).toBe('personal');
  });

  it('sin dominios conocidos solo marca como personales los correos comunes', () => {
    expect(emailKind('ana@gmail.com')).toBe('personal');
    expect(emailKind('ana@hotmail.com')).toBe('personal');
    expect(emailKind('ana@uni.edu.co')).toBe('unknown');
    expect(emailKind('ana')).toBe('invalid');
  });

  it('un dominio que solo termina parecido no cuenta como institucional', () => {
    expect(emailKind('ana@fakeuni.edu.co', ['uni.edu.co'])).toBe('personal');
  });
});

describe('roleName', () => {
  it('traduce el rol asignado', () => {
    expect(roleName('TEACHER')).toBe('profesor');
    expect(roleName('STUDENT')).toBe('estudiante');
    expect(roleName(null)).toBeNull();
  });
});
