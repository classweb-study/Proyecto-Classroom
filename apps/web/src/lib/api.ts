export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/**
 * Same-origin JSON request. The browser adds the Origin header to every
 * non-GET request, which the API requires for mutations.
 */
export async function api<T>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers:
      options.body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
    body:
      options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    throw new ApiError(response.status, body.error ?? 'UNKNOWN');
  }

  return (await response.json().catch(() => ({}))) as T;
}

const ERROR_MESSAGES: Record<string, string> = {
  ROLE_CONFLICT: 'Esta cuenta ya tiene otro rol activo. Revisa sus membresías antes de cambiarlo.',
  FORBIDDEN: 'No tienes permiso para hacer esto.',
  NOT_FOUND: 'No encontramos lo que buscas o ya no tienes acceso.',
  ALREADY_MEMBER: 'Ya perteneces a este curso.',
  COURSE_ACCESS_REMOVED:
    'El profesor te retiró de este curso. Escríbele si crees que es un error.',
  USER_NOT_IN_INSTITUTION:
    'Esa persona no pertenece a la institución con ese rol.',
  CANNOT_REMOVE_YOURSELF: 'No puedes quitarte a ti mismo del curso.',
  COURSE_ARCHIVED: 'El curso está archivado.',
  DEADLINE_PASSED:
    'La fecha de entrega ya pasó y esta actividad no acepta entregas tardías.',
  INVALID_SUBMISSION:
    'Revisa la entrega: el enlace debe empezar por https:// (y ser de tu copia en github.com si es un repositorio) y el commit debe tener entre 7 y 40 caracteres hexadecimales.',
  SUBMISSION_CONFLICT:
    'Se registró otra entrega al mismo tiempo. Recarga e inténtalo de nuevo.',
  SCORE_OUT_OF_RANGE: 'La nota supera el máximo de la actividad.',
  INVALID_SCORE: 'La nota debe ser un número positivo con máximo 2 decimales.',
  INVALID_REVIEW: 'Escribe un comentario o una nota.',
  INVALID_JOIN_CODE: 'El código no tiene un formato válido.',
  INVALID_COURSE: 'Revisa los datos del curso (el nombre es obligatorio).',
  INVALID_ACTIVITY:
    'Revisa la actividad: título, instrucciones y tipo son obligatorios; para repositorios se requiere el enlace principal de la plantilla en GitHub y los enlaces deben empezar por https://.',
  INVALID_TEMPLATE: 'El profesor debe elegir una plantilla de GitHub autorizada para la institución.',
  REPOSITORY_CONFLICT: 'Ya existe otro repositorio con ese nombre. Contacta al administrador.',
  REPOSITORIES_UNCONFIGURED: 'La institución aún debe conectar su organización de GitHub.',
  INVALID_PROFILE: 'Revisa los datos del perfil.',
  INVALID_MESSAGE: 'El mensaje no puede estar vacío (máximo 2000 caracteres).',
  INVALID_INSTITUTION: 'Revisa los datos de la institución.',
  SLUG_ALREADY_EXISTS: 'Ya existe una institución con ese identificador.',
  ADMIN_USER_NOT_FOUND:
    'Esa cuenta de GitHub todavía no ha iniciado sesión en WebClass.',
  ORIGIN_FORBIDDEN: 'La solicitud fue bloqueada por seguridad.',
  SERVICE_UNAVAILABLE: 'El servicio no está disponible. Inténtalo más tarde.',
};

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && ERROR_MESSAGES[error.code]) {
    return ERROR_MESSAGES[error.code]!;
  }

  return fallback;
}

export function formatDate(value: string | null) {
  if (!value) return 'Sin fecha';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** ISO string → value for <input type="datetime-local"> in local time. */
export function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export type CourseRole = 'TEACHER' | 'STUDENT';
export type ActivityKind = 'REPOSITORY' | 'LINK' | 'TEXT';
export type ActivityStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type SubmissionState =
  | 'MISSING'
  | 'SUBMITTED'
  | 'LATE'
  | 'REVIEWED';

export type CourseSummary = {
  id: string;
  institutionId: string;
  name: string;
  code: string | null;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  viewerRole: CourseRole;
  studentCount: number;
  activityCount: number;
  createdAt: string;
};

export type CourseDetail = CourseSummary & {
  roster: Array<{ memberId: string; name: string | null; role: CourseRole; isSelf: boolean }>;
  joinCode: string | null;
  joinEnabled: boolean;
};

export type Activity = {
  id: string;
  courseId: string;
  title: string;
  instructions: string;
  rubric: string | null;
  kind: ActivityKind;
  templateRepoUrl: string | null;
  resourceUrl: string | null;
  maxScore: number | null;
  dueAt: string | null;
  allowLate: boolean;
  status: ActivityStatus;
  createdAt: string;
  updatedAt: string;
  myState?: SubmissionState;
  myScore?: number | null;
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
  reviewedAt: string | null;
  submittedAt: string;
};

export type DashboardActivity = {
  activityId: string;
  courseId: string;
  courseName: string;
  title: string;
  dueAt: string | null;
};

export const KIND_LABEL: Record<ActivityKind, string> = {
  REPOSITORY: 'Repositorio de GitHub',
  LINK: 'Enlace',
  TEXT: 'Texto',
};

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Archivada',
};

export const STATE_LABEL: Record<SubmissionState, string> = {
  MISSING: 'Sin entregar',
  SUBMITTED: 'Entregada',
  LATE: 'Entregada tarde',
  REVIEWED: 'Revisada',
};

export const STATE_CLASS: Record<SubmissionState, string> = {
  MISSING: 'pending',
  SUBMITTED: 'active',
  LATE: 'request-denied',
  REVIEWED: 'request-approved',
};

/** Where a page wants to go; main.tsx turns it into navigation state. */
export type Navigate = (target: {
  page: string;
  courseId?: string;
  activityId?: string;
}) => void;
