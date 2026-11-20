import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { RequestMessages } from '../components/RequestMessages';

type AccessRole = 'TEACHER' | 'STUDENT';

type RequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'CANCELLED';

type Institution = {
  id: string;
  name: string;
  slug: string;
};

type MyAccessRequest = {
  id: string;
  institution: Institution;
  status: RequestStatus;
  requestedRole: AccessRole | null;
  assignedRole: AccessRole | null;
  decisionReason: string | null;
  fullName: string | null;
  contactEmail: string | null;
  institutionalEmail: string | null;
  institutionalCode: string | null;
  requestReason: string | null;
  hasActiveMembership: boolean;
  messageCount: number;
  createdAt: string;
  decidedAt: string | null;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; requests: MyAccessRequest[] }
  | { status: 'error' };

type AccessRequestsPageProps = {
  githubLogin: string;
  loggingOut: boolean;
  onLogout: () => void;
  /** Shown inside the app shell for people who already belong somewhere. */
  embedded?: boolean;
  onOpenPlatform?: () => void;
};

const STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  DENIED: 'Rechazada',
  CANCELLED: 'Cancelada',
};

const ROLE_LABEL: Record<AccessRole, string> = {
  TEACHER: 'Docente',
  STUDENT: 'Estudiante',
};

const SUBMIT_ERRORS: Record<string, string> = {
  REQUEST_UNAVAILABLE: 'Ya administras esta institución, tienes una solicitud pendiente o la institución dejó de estar disponible.', 
  INVALID_ACCESS_REQUEST:
    'Revisa los datos: nombre, correo de contacto, rol y motivo son obligatorios.',
  INSTITUTION_NOT_FOUND: 'La institución seleccionada ya no existe.',
  ALREADY_MEMBER: 'Ya perteneces a esta institución.',
  ACCESS_REQUEST_PENDING_EXISTS:
    'Ya tienes una solicitud pendiente para esta institución.',
};

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

function NewRequestForm({
  onSubmitted,
  onCancel,
  prefill,
}: {
  onSubmitted: () => void;
  onCancel: () => void;
  /** A denied or cancelled request to correct and send again. */
  prefill?: MyAccessRequest;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Institution[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [institution, setInstitution] =
    useState<Institution | null>(prefill?.institution ?? null);

  const [requestedRole, setRequestedRole] =
    useState<AccessRole | 'ADMIN'>(prefill?.requestedRole ?? 'STUDENT');
  const [fullName, setFullName] = useState(prefill?.fullName ?? '');
  const [contactEmail, setContactEmail] = useState(
    prefill?.contactEmail ?? '',
  );
  const [institutionalEmail, setInstitutionalEmail] =
    useState(prefill?.institutionalEmail ?? '');
  const [institutionalCode, setInstitutionalCode] =
    useState(prefill?.institutionalCode ?? '');
  const [requestReason, setRequestReason] = useState(
    prefill?.requestReason ?? '',
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (institution) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(
        `/institutions?q=${encodeURIComponent(query.trim())}`,
        {
          credentials: 'same-origin',
          signal: controller.signal,
        },
      )
        .then(async response => {
          if (!response.ok) {
            throw new Error('Search failed');
          }

          const body = (await response.json()) as {
            institutions: Institution[];
          };

          setResults(body.institutions);
          setSearchFailed(false);
        })
        .catch(searchError => {
          if (
            searchError instanceof DOMException &&
            searchError.name === 'AbortError'
          ) {
            return;
          }

          setSearchFailed(true);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, institution]);

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!institution) {
      setError('Selecciona la institución a la que quieres ingresar.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(requestedRole === 'ADMIN' ? `/me/admin-requests/${institution.id}` : '/me/access-requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          institutionId: institution.id,
          requestedRole,
          fullName,
          contactEmail,
          institutionalEmail,
          institutionalCode,
          requestReason,
        }),
      });

      if (!response.ok) {
        const body = (await response
          .json()
          .catch(() => ({}))) as { error?: string };

        setError(
          (body.error && SUBMIT_ERRORS[body.error]) ??
            'No pudimos enviar la solicitud. Inténtalo nuevamente.',
        );
        return;
      }

      onSubmitted();
    } catch {
      setError(
        'No pudimos enviar la solicitud. Inténtalo nuevamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="access-form" onSubmit={submit}>
      <div className="access-form-heading">
        <h2>
          {prefill
            ? 'Corregir y reenviar solicitud'
            : 'Nueva solicitud de acceso'}
        </h2>
        <p className="muted">
          Selecciona la institución y el rol que necesitas. Puedes usar Gmail u otro correo; el acceso
          nunca se concede automáticamente.
        </p>
        {prefill?.decisionReason && (
          <p className="decision-reason">
            Motivo del rechazo anterior: {prefill.decisionReason}
          </p>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="institution-search">Institución</label>

        {institution ? (
          <div className="selected-institution">
            <strong>{institution.name}</strong>
            <button
              type="button"
              className="link-button"
              onClick={() => setInstitution(null)}
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <input
              id="institution-search"
              type="search"
              placeholder="Busca tu universidad"
              value={query}
              maxLength={100}
              onChange={event => setQuery(event.target.value)}
            />

            {searchFailed && (
              <span className="field-error">
                No pudimos buscar instituciones.
              </span>
            )}

            {!searchFailed && results.length === 0 && (
              <span className="field-hint">
                No hay instituciones que coincidan. Si tu
                universidad no aparece, todavía no está
                registrada en WebClass.
              </span>
            )}

            {results.length > 0 && (
              <ul className="institution-results">
                {results.map(result => (
                  <li key={result.id}>
                    <button
                      type="button"
                      onClick={() => setInstitution(result)}
                    >
                      {result.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="requested-role">Rol solicitado</label>
        <select
          id="requested-role"
          value={requestedRole}
          onChange={event =>
            setRequestedRole(event.target.value as AccessRole | 'ADMIN')
          }
        >
          <option value="STUDENT">Estudiante</option>
          <option value="TEACHER">Docente</option>
          <option value="ADMIN">Administrador de institución</option>
        </select>
      </div>

      {requestedRole === 'ADMIN' ? <p>El administrador general revisará tu cuenta de GitHub y la institución seleccionada.</p> : <>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="full-name">Nombre completo</label>
          <input
            id="full-name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            value={fullName}
            onChange={event => setFullName(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="contact-email">Correo de contacto</label>
          <input
            id="contact-email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={contactEmail}
            onChange={event =>
              setContactEmail(event.target.value)
            }
          />
        </div>

        <div className="form-field">
          <label htmlFor="institutional-email">
            Correo institucional (opcional)
          </label>
          <input
            id="institutional-email"
            type="email"
            maxLength={254}
            value={institutionalEmail}
            onChange={event =>
              setInstitutionalEmail(event.target.value)
            }
          />
        </div>

        <div className="form-field">
          <label htmlFor="institutional-code">
            Código universitario (opcional)
          </label>
          <input
            id="institutional-code"
            maxLength={40}
            value={institutionalCode}
            onChange={event =>
              setInstitutionalCode(event.target.value)
            }
          />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="request-reason">
          Motivo o explicación
        </label>
        <textarea
          id="request-reason"
          required
          maxLength={1000}
          rows={4}
          placeholder="Ej.: Soy estudiante de Ingeniería de Sistemas, semestre 5."
          value={requestReason}
          onChange={event =>
            setRequestReason(event.target.value)
          }
        />
      </div>

      </>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button
          type="button"
          className="secondary-action"
          onClick={onCancel}
          disabled={submitting}
        >
          Volver
        </button>
        <button
          type="submit"
          className="primary-action"
          disabled={submitting}
        >
          {submitting ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </div>
    </form>
  );
}

export function AccessRequestsPage({
  githubLogin,
  loggingOut,
  onLogout,
  embedded = false,
  onOpenPlatform,
}: AccessRequestsPageProps) {
  const [state, setState] = useState<LoadState>({
    status: 'loading',
  });
  const [adminRequests, setAdminRequests] = useState<{id: string; institution: string; status: RequestStatus}[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [prefill, setPrefill] = useState<MyAccessRequest | undefined>();
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [cancellingId, setCancellingId] =
    useState<string | null>(null);
  const [actionError, setActionError] =
    useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const response = await fetch('/me/access-requests', {
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Load failed');
      }

      const body = (await response.json()) as {
        requests: MyAccessRequest[];
      };

      const adminResponse = await fetch('/me/admin-requests', {credentials:'same-origin'});
      if (!adminResponse.ok) throw new Error('Load failed');
      const {requests} = await adminResponse.json();
      setAdminRequests(requests);
      setState({ status: 'ready', requests: body.requests });
      setShowForm(body.requests.length === 0 && !requests.length && !embedded);
      setPrefill(undefined);
    } catch {
      setState({ status: 'error' });
    }
  }, [embedded]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function cancel(requestId: string) {
    setCancellingId(requestId);
    setActionError(null);

    try {
      const response = await fetch(
        `/me/access-requests/${requestId}/cancel`,
        {
          method: 'POST',
          credentials: 'same-origin',
        },
      );

      if (!response.ok) {
        throw new Error('Cancel failed');
      }

      await loadRequests();
    } catch {
      setActionError(
        'No pudimos cancelar la solicitud. Puede que ya haya sido revisada.',
      );
    } finally {
      setCancellingId(null);
    }
  }

  const hasPending =
    state.status === 'ready' &&
    state.requests.some(request => request.status === 'PENDING');

  function pendingFor(institutionId: string) {
    return (
      state.status === 'ready' &&
      state.requests.some(
        request =>
          request.status === 'PENDING' &&
          request.institution.id === institutionId,
      )
    );
  }

  const Wrapper = embedded ? 'div' : 'main';

  return (
    <Wrapper
      className={embedded ? 'admin-page' : 'access-requests-page'}
    >
      {embedded ? (
        <section className="page-heading">
          <div>
            <p className="page-kicker">MI CUENTA</p>
            <h1>Mis solicitudes</h1>
            <p>
              Solicita acceso a otra institución o revisa el estado
              de tus solicitudes.
            </p>
          </div>
        </section>
      ) : (
        <header className="access-requests-header">
          <div>
            <p className="eyebrow">WebClass</p>
            <h1>Acceso a tu institución</h1>
            <p className="muted">
              Conectado como @{githubLogin}. Para usar WebClass
              necesitas que una institución apruebe tu acceso.
              Mientras tanto no podrás ver cursos ni entregar
              trabajos.
            </p>
            <ol className="next-steps">
              <li>Busca tu universidad y envía la solicitud.</li>
              <li>Un administrador de esa universidad la revisa.</li>
              <li>
                Si te pide más datos, verás su mensaje aquí. Cuando
                la apruebe, recarga la página para entrar.
              </li>
            </ol>
          </div>

          <div className="header-actions">
            {onOpenPlatform && (
              <button
                type="button"
                className="secondary-action"
                onClick={onOpenPlatform}
              >
                Administración general
              </button>
            )}
            <button
              type="button"
              className="logout-button"
              onClick={onLogout}
              disabled={loggingOut}
            >
              {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        </header>
      )}

      {state.status === 'loading' && (
        <div className="admin-loading">
          <div className="loader" />
          <span>Cargando tus solicitudes…</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="admin-error-state">
          <strong>No pudimos cargar tus solicitudes.</strong>
          <button
            type="button"
            onClick={() => void loadRequests()}
          >
            Reintentar
          </button>
        </div>
      )}

      {adminRequests.length > 0 && <section className="admin-panel"><h2>Mis solicitudes de administración</h2>
        <ul className="plain-list">{adminRequests.map(r => <li key={r.id}>{r.institution} · {STATUS_LABEL[r.status]}</li>)}</ul>
      </section>}
      {state.status === 'ready' && showForm && (
        <NewRequestForm
          key={prefill?.id ?? 'new'}
          prefill={prefill}
          onSubmitted={() => void loadRequests()}
          onCancel={() => {
            setShowForm(false);
            setPrefill(undefined);
          }}
        />
      )}

      {state.status === 'ready' && !showForm && (
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="page-kicker">MIS SOLICITUDES</p>
              <h2>Historial de solicitudes</h2>
            </div>

            <button
              type="button"
              className="primary-action"
              onClick={() => setShowForm(true)}
            >
              Nueva solicitud
            </button>
          </div>

          {hasPending && (
            <p className="field-hint">
              Mientras tu solicitud esté pendiente, un
              administrador de la institución la revisará.
            </p>
          )}

          {actionError && (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          )}

          {state.requests.length === 0 && (
            <p className="field-hint">
              No has enviado solicitudes.
            </p>
          )}

          <div className="access-request-list">
            {state.requests.map(request => (
              <div className="access-request-item" key={request.id}>
              <article className="my-request-row">
                <div className="my-request-main">
                  <strong>{request.institution.name}</strong>
                  <span>
                    {request.requestedRole
                      ? `Rol solicitado: ${ROLE_LABEL[request.requestedRole]} · `
                      : ''}
                    Enviada {formatDate(request.createdAt)}
                  </span>

                  {request.status === 'APPROVED' &&
                    request.assignedRole && (
                      <span>
                        Aprobada como{' '}
                        {ROLE_LABEL[request.assignedRole]}.
                        {request.hasActiveMembership
                          ? 'Recarga la página para entrar.'
                          : 'Tu membresía en esta institución ya no está activa.'}
                      </span>
                    )}

                  {request.status === 'DENIED' && (
                    <span className="decision-reason">
                      Motivo:{' '}
                      {request.decisionReason ??
                        'El administrador no indicó un motivo.'}
                    </span>
                  )}
                </div>

                <span
                  className={`status-pill request-${request.status.toLowerCase()}`}
                >
                  {STATUS_LABEL[request.status]}
                </span>

                <div className="my-request-actions">
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
                    {request.messageCount > 0 &&
                      ` (${request.messageCount})`}
                  </button>

                  {(request.status === 'DENIED' ||
                    request.status === 'CANCELLED' ||
                    request.status === 'APPROVED') &&
                    !request.hasActiveMembership &&
                    !pendingFor(request.institution.id) && (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => {
                          setPrefill(request);
                          setShowForm(true);
                        }}
                      >
                        {request.status === 'APPROVED' ? 'Volver a solicitar acceso' : 'Corregir y reenviar'}
                      </button>
                    )}

                  {request.status === 'PENDING' && (
                    <button
                      type="button"
                      className="deny-button"
                      disabled={cancellingId === request.id}
                      onClick={() => void cancel(request.id)}
                    >
                      {cancellingId === request.id
                        ? 'Cancelando…'
                        : 'Cancelar'}
                    </button>
                  )}
                </div>
              </article>

              {openThread === request.id && (
                <RequestMessages
                  endpoint={`/me/access-requests/${request.id}/messages`}
                  viewer="requester"
                />
              )}
              </div>
            ))}
          </div>
        </section>
      )}
    </Wrapper>
  );
}
