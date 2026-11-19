import { useCallback, useEffect, useState } from 'react';

type AssignableRole = 'TEACHER' | 'STUDENT';

type PendingAccessRequest = {
  id: string;
  userId: string;
  githubLogin: string;
  avatarUrl: string | null;
  institutionId: string;
  institutionName: string;
  requestedRole: AssignableRole | null;
  fullName: string | null;
  contactEmail: string | null;
  institutionalEmail: string | null;
  institutionalCode: string | null;
  requestReason: string | null;
  domainMatch: boolean;
  createdAt: string;
};

const ROLE_LABEL: Record<AssignableRole, string> = {
  TEACHER: 'Docente',
  STUDENT: 'Estudiante',
};

type AdminUsersPageProps = {
  institutionId: string;
  institutionName: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; requests: PendingAccessRequest[] }
  | { status: 'error'; message: string };

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

export function AdminUsersPage({
  institutionId,
  institutionName,
}: AdminUsersPageProps) {
  const [state, setState] = useState<LoadState>({
    status: 'loading',
  });

  const [processingId, setProcessingId] =
    useState<string | null>(null);
  const [denyingId, setDenyingId] =
    useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const loadRequests = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const response = await fetch(
        `/admin/institutions/${institutionId}/access-requests`,
        {
          credentials: 'same-origin',
        },
      );

      if (!response.ok) {
        throw new Error('No fue posible cargar las solicitudes');
      }

      const body = (await response.json()) as {
        requests: PendingAccessRequest[];
      };

      setState({
        status: 'ready',
        requests: body.requests,
      });
    } catch {
      setState({
        status: 'error',
        message:
          'No pudimos cargar las solicitudes de acceso.',
      });
    }
  }, [institutionId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function approve(
    requestId: string,
    role: AssignableRole,
  ) {
    setProcessingId(requestId);

    try {
      const response = await fetch(
        `/admin/institutions/${institutionId}/access-requests/${requestId}/approve`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role }),
        },
      );

      if (!response.ok) {
        throw new Error('Approval failed');
      }

      await loadRequests();
    } catch {
      setState({
        status: 'error',
        message:
          'No pudimos aprobar esta solicitud. Inténtalo nuevamente.',
      });
    } finally {
      setProcessingId(null);
    }
  }

  async function deny(requestId: string) {
    setProcessingId(requestId);

    try {
      const response = await fetch(
        `/admin/institutions/${institutionId}/access-requests/${requestId}/deny`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: denyReason }),
        },
      );

      if (!response.ok) {
        throw new Error('Denial failed');
      }

      setDenyingId(null);
      setDenyReason('');
      await loadRequests();
    } catch {
      setState({
        status: 'error',
        message:
          'No pudimos denegar esta solicitud. Inténtalo nuevamente.',
      });
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">ADMINISTRACIÓN</p>
          <h1>Usuarios</h1>
          <p>
            Revisa quién solicita acceso a {institutionName} y
            decide qué rol académico puede utilizar.
          </p>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="page-kicker">SOLICITUDES DE ACCESO</p>
            <h2>Pendientes de revisión</h2>
          </div>

          {state.status === 'ready' && (
            <span className="request-count">
              {state.requests.length}{' '}
              {state.requests.length === 1
                ? 'pendiente'
                : 'pendientes'}
            </span>
          )}
        </div>

        {state.status === 'loading' && (
          <div className="admin-loading">
            <div className="loader" />
            <span>Cargando solicitudes…</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="admin-error-state">
            <strong>No pudimos cargar los usuarios.</strong>
            <span>{state.message}</span>

            <button
              type="button"
              onClick={() => void loadRequests()}
            >
              Reintentar
            </button>
          </div>
        )}

        {state.status === 'ready' &&
          state.requests.length === 0 && (
            <div className="empty-admin-state large">
              <div className="empty-admin-letter">U</div>
              <strong>No hay solicitudes pendientes</strong>
              <p>
                Cuando alguien solicite acceso a esta
                institución, aparecerá aquí hasta que decidas
                aprobarla o denegarla.
              </p>
            </div>
          )}

        {state.status === 'ready' &&
          state.requests.length > 0 && (
            <div className="access-request-list">
              {state.requests.map(request => {
                const processing =
                  processingId === request.id;
                const denying = denyingId === request.id;

                return (
                  <div
                    className="access-request-item"
                    key={request.id}
                  >
                  <article className="access-request-row">
                    <div className="access-request-user">
                      {request.avatarUrl ? (
                        <img
                          src={request.avatarUrl}
                          alt=""
                        />
                      ) : (
                        <div className="request-avatar">
                          {request.githubLogin
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      )}

                      <div>
                        <strong>
                          {request.fullName ??
                            `@${request.githubLogin}`}
                        </strong>
                        <span>
                          @{request.githubLogin} ·{' '}
                          {formatDate(request.createdAt)}
                          {request.requestedRole &&
                            ` · Solicita: ${ROLE_LABEL[request.requestedRole]}`}
                        </span>
                      </div>
                    </div>

                    <div className="access-request-status">
                      {request.domainMatch ? (
                        <span
                          className="status-pill domain-match"
                          title="El correo coincide con un dominio de la institución. Es una pista, no una prueba."
                        >
                          Dominio coincide
                        </span>
                      ) : (
                        <span className="status-pill pending">
                          Pendiente
                        </span>
                      )}
                    </div>

                    <div className="access-request-actions">
                      <button
                        type="button"
                        className="approve-button"
                        disabled={processing}
                        onClick={() =>
                          void approve(
                            request.id,
                            'TEACHER',
                          )
                        }
                      >
                        Profesor
                      </button>

                      <button
                        type="button"
                        className="approve-button secondary"
                        disabled={processing}
                        onClick={() =>
                          void approve(
                            request.id,
                            'STUDENT',
                          )
                        }
                      >
                        Estudiante
                      </button>

                      <button
                        type="button"
                        className="deny-button"
                        disabled={processing}
                        onClick={() => {
                          setDenyingId(
                            denying ? null : request.id,
                          );
                          setDenyReason('');
                        }}
                      >
                        {processing
                          ? 'Procesando…'
                          : 'Denegar'}
                      </button>
                    </div>
                  </article>

                  {(request.contactEmail ||
                    request.institutionalEmail ||
                    request.institutionalCode ||
                    request.requestReason) && (
                    <dl className="access-request-details">
                      {request.contactEmail && (
                        <div>
                          <dt>Correo de contacto</dt>
                          <dd>{request.contactEmail}</dd>
                        </div>
                      )}
                      {request.institutionalEmail && (
                        <div>
                          <dt>Correo institucional</dt>
                          <dd>{request.institutionalEmail}</dd>
                        </div>
                      )}
                      {request.institutionalCode && (
                        <div>
                          <dt>Código universitario</dt>
                          <dd>{request.institutionalCode}</dd>
                        </div>
                      )}
                      {request.requestReason && (
                        <div className="wide">
                          <dt>Motivo</dt>
                          <dd>{request.requestReason}</dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {denying && (
                    <form
                      className="deny-reason-form"
                      onSubmit={event => {
                        event.preventDefault();
                        void deny(request.id);
                      }}
                    >
                      <label htmlFor={`deny-${request.id}`}>
                        Motivo del rechazo (lo verá el
                        solicitante)
                      </label>
                      <textarea
                        id={`deny-${request.id}`}
                        required
                        maxLength={500}
                        rows={3}
                        placeholder="Ej.: Solicita acceso a tu institución correspondiente."
                        value={denyReason}
                        onChange={event =>
                          setDenyReason(event.target.value)
                        }
                      />
                      <div className="form-actions">
                        <button
                          type="button"
                          className="secondary-action"
                          disabled={processing}
                          onClick={() => setDenyingId(null)}
                        >
                          Volver
                        </button>
                        <button
                          type="submit"
                          className="deny-button"
                          disabled={
                            processing ||
                            denyReason.trim().length === 0
                          }
                        >
                          Confirmar rechazo
                        </button>
                      </div>
                    </form>
                  )}
                  </div>
                );
              })}
            </div>
          )}
      </section>
    </div>
  );
}
