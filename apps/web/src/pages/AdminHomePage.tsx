import { RemovedMembersPanel } from './RemovedMembersPanel';
import { useEffect, useState } from 'react';

type AdminHomePageProps = {
  institutionId: string;
  institutionName: string;
  onOpenRequests: () => void;
  onManageInstitutions?: () => void;
};

type Overview = {
  counts: {
    teachers: number;
    students: number;
    pendingRequests: number;
    courses: number;
  };
  domains: Array<{ id: string; domain: string }>;
};

type AuditEntry = {
  id: string;
  action: string;
  actorLogin: string | null;
  targetLogin: string | null;
  details: string | null;
  createdAt: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; overview: Overview; entries: AuditEntry[] }
  | { status: 'error' };

const ROLE_LABEL: Record<string, string> = {
  TEACHER: 'docente',
  STUDENT: 'estudiante',
};

function describe(entry: AuditEntry): string {
  const actor = entry.actorLogin ? `@${entry.actorLogin}` : 'Alguien';
  const target = entry.targetLogin ? `@${entry.targetLogin}` : 'un usuario';

  switch (entry.action) {
    case 'REQUEST_SUBMITTED':
      return `${actor} solicitó acceso`;
    case 'REQUEST_APPROVED':
      return `${actor} aprobó la solicitud de ${target}`;
    case 'REQUEST_DENIED':
      return `${actor} rechazó la solicitud de ${target}`;
    case 'REQUEST_CANCELLED':
      return `${actor} canceló su solicitud`;
    case 'MEMBERSHIP_REVOKED':
      return `${actor} revocó el acceso de ${target}`;
    case 'INSTITUTION_CREATED':
      return `${actor} registró la institución y nombró administrador a ${target}`;
    case 'MEMBERSHIP_ROLE_CHANGED': {
      const [from, to] = (entry.details ?? '').split('->');
      if (to === 'ADMIN') {
        return `${actor} nombró administrador a ${target}`;
      }
      return `${actor} cambió a ${target} de ${ROLE_LABEL[from ?? ''] ?? from} a ${ROLE_LABEL[to ?? ''] ?? to}`;
    }
    case 'INSTITUTION_UPDATED':
      return `${actor} editó la información de la institución`;
    case 'DOMAIN_ADDED':
      return `${actor} agregó el dominio ${entry.details}`;
    case 'DOMAIN_REMOVED':
      return `${actor} quitó el dominio ${entry.details}`;
    default:
      return `${actor}: ${entry.action}`;
  }
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function AdminHomePage({
  institutionId,
  institutionName,
  onOpenRequests,
  onManageInstitutions,
}: AdminHomePageProps) {
  const [state, setState] = useState<LoadState>({
    status: 'loading',
  });

  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const options = {
      credentials: 'same-origin' as const,
      signal: controller.signal,
    };

    setState({ status: 'loading' });

    Promise.all([
      fetch(`/admin/institutions/${institutionId}`, options),
      fetch(`/admin/institutions/${institutionId}/audit-log`, options),
    ])
      .then(async ([overviewResponse, logResponse]) => {
        if (!overviewResponse.ok || !logResponse.ok) {
          throw new Error('Load failed');
        }

        const overview = (await overviewResponse.json()) as Overview;
        const log = (await logResponse.json()) as {
          entries: AuditEntry[];
        };

        setState({
          status: 'ready',
          overview,
          entries: log.entries,
        });
      })
      .catch(error => {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        setState({ status: 'error' });
      });

    return () => controller.abort();
  }, [institutionId, revision]);

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">ADMINISTRACIÓN</p>
          <h1>Panel institucional</h1>
          <p>
            Resumen de acceso y actividad de {institutionName}.
          </p>
        </div>

        <span className="admin-badge">
          <span />
          Administrador
        </span>
      </section>

      <RemovedMembersPanel key={institutionId} institutionId={institutionId} institutionName={institutionName}
        onOpenRequests={onOpenRequests} onRestored={() => setRevision(value => value + 1)} />

      {onManageInstitutions && (
        <section className="admin-panel">
          <h2>Universidades</h2>
          <p>Registra una institución y elige quién administrará sus solicitudes.</p>
          <button type="button" className="primary-action" onClick={onManageInstitutions}>
            Crear o administrar instituciones
          </button>
        </section>
      )}

      {state.status === 'loading' && (
        <div className="admin-loading">
          <div className="loader" />
          <span>Cargando panel…</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="admin-error-state">
          <strong>No pudimos cargar el panel.</strong>
          <span>Recarga la página para intentarlo de nuevo.</span>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <section className="admin-summary-grid">
            <article className="summary-card">
              <div>
                <span className="summary-label">
                  Solicitudes pendientes
                </span>
                <strong>{state.overview.counts.pendingRequests}</strong>
                {state.overview.counts.pendingRequests > 0 && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={onOpenRequests}
                  >
                    Revisar solicitudes
                  </button>
                )}
              </div>
            </article>

            <article className="summary-card">
              <div>
                <span className="summary-label">Profesores</span>
                <strong>{state.overview.counts.teachers}</strong>
                <p>Con acceso activo</p>
              </div>
            </article>

            <article className="summary-card">
              <div>
                <span className="summary-label">Estudiantes</span>
                <strong>{state.overview.counts.students}</strong>
                <p>Con acceso activo</p>
              </div>
            </article>

            <article className="summary-card">
              <div>
                <span className="summary-label">Cursos</span>
                <strong>{state.overview.counts.courses}</strong>
                <p>Activos</p>
              </div>
            </article>
          </section>

          {state.overview.domains.length === 0 && (
            <p className="field-hint">
              Aún no hay dominios institucionales registrados.
              Agrégalos en «Institución» para ver una pista al
              revisar solicitudes.
            </p>
          )}

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="page-kicker">REGISTRO</p>
                <h2>Actividad reciente</h2>
              </div>
            </div>

            {state.entries.length === 0 ? (
              <div className="empty-admin-state">
                <strong>Todavía no hay actividad</strong>
                <p>
                  Aquí aparecerán las solicitudes, decisiones y
                  cambios de rol.
                </p>
              </div>
            ) : (
              <ol className="audit-log">
                {state.entries.map(entry => (
                  <li key={entry.id}>
                    <span>{describe(entry)}</span>
                    {entry.action === 'REQUEST_DENIED' &&
                      entry.details && (
                        <span className="audit-detail">
                          Motivo: {entry.details}
                        </span>
                      )}
                    <time dateTime={entry.createdAt}>
                      {formatDate(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
