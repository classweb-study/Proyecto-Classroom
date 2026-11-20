/*
 * Estado de la sesión sin DOM: tipos de /me, qué pantalla ve cada
 * persona y cómo se interpreta cada respuesta del servidor.
 * Se prueba en tests/unit/session.test.ts.
 *
 * La decisión de permisos la toma el backend. Aquí solo se elige qué
 * pantalla mostrar con lo que /me ya devolvió; el orden de las reglas es
 * el mismo que tenía main.tsx antes de esta tarea.
 */

export type InstitutionRole = 'ADMIN' | 'TEACHER' | 'STUDENT';
export type AcademicIdentityStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export type UserInstitution = {
  id: string;
  name: string;
  slug: string;
  roles: InstitutionRole[];
  academicIdentity: null | {
    institutionalIdentifier: string;
    status: AcademicIdentityStatus;
  };
};

export type AccessRequestSummary = {
  id: string;
  institution: { id: string; name: string; slug: string };
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';
  assignedRole: 'TEACHER' | 'STUDENT' | null;
  /*
   * Campos que /me todavía NO devuelve (noviembre de 2026). Si el backend
   * los agrega, las pantallas los muestran sin más cambios.
   */
  reason?: string | null;
  /* Nombre que usa la rama feat/maura-access-requests para el motivo. */
  decisionReason?: string | null;
  contactEmail?: string | null;
  createdAt?: string | null;
};

export type CurrentUser = {
  id: string;
  github: { id: string; login: string; avatarUrl: string | null };
  academicIdentity: null | { displayName?: string };
  institutions: UserInstitution[];
  accessRequest: null | AccessRequestSummary;
};

/* ---------- Respuesta de /me ---------- */

export type MeOutcome =
  | 'ok'
  | 'anonymous'
  | 'server-error'
  | 'network-error';

/*
 * `status` es el código HTTP, o null si la petición ni siquiera llegó
 * (sin internet, servidor caído, CORS).
 */
export function classifyMeResponse(status: number | null): MeOutcome {
  if (status === null) return 'network-error';
  if (status === 401) return 'anonymous';
  if (status >= 200 && status < 300) return 'ok';
  return 'server-error';
}

/*
 * Un 401 cuando la persona YA estaba dentro significa que la sesión
 * venció o fue revocada; un 401 al cargar la página es solo "no ha
 * iniciado sesión".
 */
export function isExpiredSession(
  previouslyAuthenticated: boolean,
  outcome: MeOutcome,
): boolean {
  return previouslyAuthenticated && outcome === 'anonymous';
}

/* ---------- Qué pantalla ve la persona ---------- */

export type AccessView =
  | { kind: 'app'; institution: UserInstitution }
  | { kind: 'role-unavailable'; institution: UserInstitution }
  | { kind: 'pending'; request: AccessRequestSummary }
  | { kind: 'denied'; request: AccessRequestSummary }
  | { kind: 'no-institution' };

export function accessViewFor(user: CurrentUser): AccessView {
  const institution = user.institutions[0];
  const request = user.accessRequest;

  if (!institution && request?.status === 'PENDING') return { kind: 'pending', request };
  if (!institution && request?.status === 'DENIED') return { kind: 'denied', request };
  if (!institution) return { kind: 'no-institution' };
  if (!institution.roles.includes('ADMIN')) return { kind: 'role-unavailable', institution };
  return { kind: 'app', institution };
}

/* ---------- Correo no institucional ---------- */

const PERSONAL_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'yahoo.com',
  'yahoo.es',
  'icloud.com',
  'proton.me',
  'protonmail.com',
];

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/*
 * ¿El correo es de la institución? Si se conocen los dominios de la
 * institución, se compara con ellos (incluye subdominios: est.uni.edu.co).
 * Si no, solo se puede decir que los correos personales conocidos no lo son.
 *
 * Esto sirve para AVISAR, nunca para dar acceso: el README delegado pide
 * que los dominios ayuden a evaluar pero no prueben pertenencia.
 */
export function emailKind(
  email: string,
  institutionDomains: readonly string[] = [],
): 'institutional' | 'personal' | 'unknown' | 'invalid' {
  const domain = emailDomain(email);
  if (!domain) return 'invalid';

  const normalized = institutionDomains.map(item => item.trim().toLowerCase().replace(/^@/, ''));
  if (normalized.some(item => domain === item || domain.endsWith(`.${item}`))) {
    return 'institutional';
  }
  if (PERSONAL_DOMAINS.includes(domain)) return 'personal';
  return normalized.length > 0 ? 'personal' : 'unknown';
}

/* ---------- Textos ---------- */

export function roleName(role: 'TEACHER' | 'STUDENT' | null | undefined): string | null {
  if (role === 'TEACHER') return 'profesor';
  if (role === 'STUDENT') return 'estudiante';
  return null;
}
