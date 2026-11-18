import { useCallback, useEffect, useState, type FormEvent } from 'react';

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
}: {
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Institution[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [institution, setInstitution] =
    useState<Institution | null>(null);

  const [requestedRole, setRequestedRole] =
    useState<AccessRole>('STUDENT');
  const [fullName, setFullName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [institutionalEmail, setInstitutionalEmail] =
    useState('');
  const [institutionalCode, setInstitutionalCode] =
    useState('');
  const [requestReason, setRequestReason] = useState('');

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
      const response = await fetch('/me/access-requests', {
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
        <h2>Nueva solicitud de acceso</h2>
        <p className="muted">
          Un administrador de la institución revisará tu
          solicitud. Puedes usar Gmail u otro correo; el acceso
          nunca se concede automáticamente.
        </p>
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
                registrada en VMAT.
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
            setRequestedRole(event.target.value as AccessRole)
          }
        >
          <option value="STUDENT">Estudiante</option>
          <option value="TEACHER">Docente</option>
        </select>
      </div>

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
}: AccessRequestsPageProps) {
  const [state, setState] = useState<LoadState>({
    status: 'loading',
  });
  const [showForm, setShowForm] = useState(false);
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

      setState({ status: 'ready', requests: body.requests });
      setShowForm(body.requests.length === 0);
    } catch {
      setState({ status: 'error' });
    }
  }, []);

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

  return (
    <main className="access-requests-page">
      <header className="access-requests-header">
        <div>
          <p className="eyebrow">VMAT</p>
          <h1>Acceso a tu institución</h1>
          <p className="muted">
            Conectado como @{githubLogin}. Para usar VMAT
            necesitas que una institución apruebe tu acceso.
          </p>
        </div>

        <button
          type="button"
          className="logout-button"
          onClick={onLogout}
          disabled={loggingOut}
        >
          {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </header>

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

      {state.status === 'ready' && showForm && (
        <NewRequestForm
          onSubmitted={() => void loadRequests()}
          onCancel={() => setShowForm(false)}
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

          <div className="access-request-list">
            {state.requests.map(request => (
              <article
                className="my-request-row"
                key={request.id}
              >
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
                        Recarga la página para entrar.
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
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
