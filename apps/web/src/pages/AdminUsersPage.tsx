import { useCallback, useEffect, useState } from 'react';

import { api, errorMessage } from '../lib/api';
import { RequestMessages } from '../components/RequestMessages';

type AssignableRole = 'TEACHER' | 'STUDENT';

type RequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';

const STATUS_FILTERS: Array<[RequestStatus, string]> = [
  ['PENDING', 'Pendientes'],
  ['APPROVED', 'Aprobadas'],
  ['DENIED', 'Rechazadas'],
  ['CANCELLED', 'Canceladas'],
];

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
  status: RequestStatus;
  assignedRole: AssignableRole | null;
  decisionReason: string | null;
  decidedAt: string | null;
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

function ApplicantForm({ request, onSaved }: {
  request: PendingAccessRequest;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <details>
      <summary>Editar datos del solicitante</summary>
      <form className="access-form plain" onSubmit={async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setError('');
        try {
          await api(`/admin/institutions/${request.institutionId}/access-requests/${request.id}/applicant`, {
            method: 'PATCH',
            body: Object.fromEntries(data),
          });
          await onSaved();
        } catch (cause) {
          setError(errorMessage(cause, 'No pudimos guardar los datos. Revisa si la solicitud sigue pendiente.'));
        } finally {
          setBusy(false);
        }
      }}>
        <label className="form-field">Nombre completo
          <input name="fullName" required minLength={2} maxLength={120} defaultValue={request.fullName ?? ''} />
        </label>
        <label className="form-field">Correo de contacto
          <input name="contactEmail" type="email" required maxLength={254} defaultValue={request.contactEmail ?? ''} />
        </label>
        <label className="form-field">ID institucional
          <input name="institutionalCode" required maxLength={40} defaultValue={request.institutionalCode ?? ''} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary-action" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar datos'}
        </button>
      </form>
    </details>
  );
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
  const [statusFilter, setStatusFilter] =
    useState<RequestStatus>('PENDING');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AssignableRole | 'ALL'>(
    'ALL',
  );
  const [domainOnly, setDomainOnly] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const response = await fetch(
        `/admin/institutions/${institutionId}/access-requests?status=${statusFilter}`,
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
  }, [institutionId, statusFilter]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const term = search.trim().toLowerCase();
  const visibleRequests =
    state.status === 'ready'
      ? state.requests.filter(
          request =>
            (roleFilter === 'ALL' || request.requestedRole === roleFilter) &&
            (!domainOnly || request.domainMatch) &&
            (term === '' ||
              [
                request.fullName,
                request.githubLogin,
                request.contactEmail,
                request.institutionalEmail,
                request.institutionalCode,
              ].some(value => value?.toLowerCase().includes(term))),
        )
      : [];
  const pendingView = statusFilter === 'PENDING';

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
            <h2>
              {STATUS_FILTERS.find(([id]) => id === statusFilter)?.[1]}
            </h2>
          </div>

          {state.status === 'ready' && (
            <span className="request-count">
              {visibleRequests.length} de {state.requests.length}
            </span>
          )}
        </div>

        <div className="filter-bar">
          <div className="form-field compact">
            <label htmlFor="request-status-filter">Estado</label>
            <select
              id="request-status-filter"
              value={statusFilter}
              onChange={event =>
                setStatusFilter(event.target.value as RequestStatus)
              }
            >
              {STATUS_FILTERS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field compact">
            <label htmlFor="request-role-filter">Rol solicitado</label>
            <select
              id="request-role-filter"
              value={roleFilter}
              onChange={event =>
                setRoleFilter(event.target.value as AssignableRole | 'ALL')
              }
            >
              <option value="ALL">Todos</option>
              <option value="STUDENT">Estudiante</option>
              <option value="TEACHER">Docente</option>
            </select>
          </div>
          <div className="form-field grow">
            <label htmlFor="request-search">Buscar</label>
            <input
              id="request-search"
              type="search"
              placeholder="Nombre, usuario, correo o código"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={domainOnly}
              onChange={event => setDomainOnly(event.target.checked)}
            />
            Solo con dominio coincidente
          </label>
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
          visibleRequests.length === 0 && (
            <div className="empty-admin-state large">
              <div className="empty-admin-letter">U</div>
              <strong>No hay solicitudes para mostrar</strong>
              <p>
                {pendingView && state.requests.length === 0
                  ? 'Cuando alguien solicite acceso a esta institución, aparecerá aquí hasta que decidas aprobarla o denegarla.'
                  : 'Prueba con otros filtros.'}
              </p>
            </div>
          )}

        {state.status === 'ready' &&
          visibleRequests.length > 0 && (
            <div className="access-request-list">
              {visibleRequests.map(request => {
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
                      {request.domainMatch && (
                        <span
                          className="status-pill domain-match"
                          title="El correo coincide con un dominio de la institución. Es una pista, no una prueba."
                        >
                          Dominio coincide
                        </span>
                      )}
                      {!pendingView && (
                        <span
                          className={`status-pill request-${request.status.toLowerCase()}`}
                        >
                          {STATUS_FILTERS.find(
                            ([id]) => id === request.status,
                          )?.[1].replace(/s$/, '')}
                          {request.assignedRole &&
                            ` · ${ROLE_LABEL[request.assignedRole]}`}
                        </span>
                      )}
                      {pendingView && !request.domainMatch && (
                        <span className="status-pill pending">
                          Pendiente
                        </span>
                      )}
                    </div>

                    <div className="access-request-actions">
                      <button
                        type="button"
                        className="link-button"
                        onClick={() =>
                          setOpenThread(
                            openThread === request.id ? null : request.id,
                          )
                        }
                      >
                        Mensajes
                      </button>
                      {pendingView && (
                      <>
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
                      </>
                      )}
                    </div>
                  </article>

                  <p className="field-hint">Universidad de la solicitud: {request.institutionName}</p>
                  {pendingView && <ApplicantForm request={request} onSaved={loadRequests} />}

                  {!pendingView && request.decidedAt && (
                    <p className="field-hint decision-line">
                      Decidida {formatDate(request.decidedAt)}
                      {request.decisionReason &&
                        ` · Motivo: ${request.decisionReason}`}
                    </p>
                  )}

                  {openThread === request.id && (
                    <RequestMessages
                      endpoint={`/admin/institutions/${institutionId}/access-requests/${request.id}/messages`}
                      viewer="admin"
                    />
                  )}

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
