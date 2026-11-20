import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { describe } from './AdminHomePage';
import { api, errorMessage, formatDate } from '../lib/api';

type PlatformInstitution = {
  id: string;
  name: string;
  slug: string;
  admins: string[];
  members: number;
  createdAt: string;
};

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Platform administration. Only GitHub accounts listed by the deployment
 * (PLATFORM_ADMIN_GITHUB_IDS) can reach these endpoints; the API enforces it.
 */
export function PlatformPage({ onChanged }: { onChanged: () => void }) {
  const [institutions, setInstitutions] = useState<
    PlatformInstitution[] | null
  >(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [requests, setRequests] = useState<{id:string; institution:string; login:string; createdAt:string}[]>([]);
  const [events, setEvents] = useState<(Parameters<typeof describe>[0] & {institution:string})[]>([]);
  const [actor, setActor] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    { kind: 'ok' | 'error'; text: string } | null
  >(null);

  const load = useCallback(() => {
    Promise.all([
      api<{ institutions: PlatformInstitution[] }>('/platform/institutions'),
      api<{ requests: typeof requests }>('/platform/admin-requests'),
      api<{ events: typeof events }>('/platform/admin-history'),
    ]).then(([catalog, queue, history]) => {
      setInstitutions(catalog.institutions);
      setRequests(queue.requests);
      setEvents(history.events);
    }).catch(() => setMessage({kind:'error', text:'No pudimos cargar el panel. Recarga para reintentar.'}));

  }, []);

  useEffect(load, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      await api('/platform/institutions', {
        method: 'POST',
        body: { name, slug },
      });
      setMessage({
        kind: 'ok',
        text: 'Institución creada. Ya pueden solicitar administrarla.',
      });
      setName('');
      setSlug('');
      setSlugTouched(false);
      load();
      onChanged();
    } catch (error) {
      setMessage({
        kind: 'error',
        text: errorMessage(error, 'No pudimos crear la institución.'),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">ADMINISTRADOR GENERAL</p>
          <h1>Administración general</h1>
          <p>
            Crea universidades, colegios o escuelas y elige quién administrará cada institución.
          </p>
        </div>
      </section>

      <section className="admin-panel">
        <h2>Solicitudes de administradores de institución</h2>
        {requests.length > 0 && <p className="field-hint">Aprobar reemplaza el rol actual del solicitante en esa institución.</p>}
        {institutions && !requests.length && <p>No hay solicitudes pendientes.</p>}
        <div className="access-request-list">{requests.map(r => <article className="access-request-row" key={r.id}>
          <div className="access-request-user">
            <div className="request-avatar">{r.login.charAt(0).toUpperCase()}</div>
            <div><strong>@{r.login}</strong><span>{r.institution} · {formatDate(r.createdAt)}</span></div>
          </div>
          <div className="access-request-status"><span className="status-pill pending">Pendiente</span></div>
          <div className="access-request-actions">
          {(['APPROVED', 'DENIED'] as const).map(decision =>
            <button className={decision === 'APPROVED' ? 'approve-button' : 'deny-button'} key={decision} disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                await api(`/platform/admin-requests/${r.id}`, {method:'POST', body:{decision}});
                setMessage({kind:'ok',text: decision === 'APPROVED' ? 'Solicitud aprobada.' : 'Solicitud denegada.'});
              } catch (error) {setMessage({kind:'error',text:errorMessage(error, 'No pudimos guardar la decisión.')});}
              finally {load(); setBusy(false);}
            }}>{decision === 'APPROVED' ? 'Aprobar' : 'Denegar'}</button>)}
        </div></article>)}</div>
      </section>
      <form className="admin-panel stack-form" onSubmit={create}>
        <h2>Nueva institución</h2>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="platform-name">Nombre</label>
            <input
              id="platform-name"
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={event => {
                setName(event.target.value);
                if (!slugTouched) setSlug(slugify(event.target.value));
              }}
            />
          </div>
          <div className="form-field">
            <label htmlFor="platform-slug">Identificador</label>
            <input
              id="platform-slug"
              required
              maxLength={50}
              pattern="[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?"
              value={slug}
              onChange={event => {
                setSlugTouched(true);
                setSlug(event.target.value.toLowerCase());
              }}
            />
            <span className="field-hint">
              Minúsculas, números y guiones. Ej.: unisabana
            </span>
          </div>

        </div>

        {message && (
          <p
            className={message.kind === 'ok' ? 'form-success' : 'form-error'}
            role="status"
          >
            {message.text}
          </p>
        )}

        <div className="form-actions">
          <button type="submit" className="primary-action" disabled={busy}>
            {busy ? 'Creando…' : 'Crear institución'}
          </button>
        </div>
      </form>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="page-kicker">REGISTRADAS</p>
            <h2>Todas las instituciones</h2>
          </div>
        </div>

        {!institutions ? (
          <div className="admin-loading">
            <div className="loader" />
          </div>
        ) : (
          <ul className="plain-list">
            {institutions.map(item => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span className="muted">
                    {item.slug} · {item.members} miembros · creada{' '}
                    {formatDate(item.createdAt)}
                  </span>
                </div>
                <span>Administradores: {item.admins.map(login => '@' + login).join(', ') || 'ninguno'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="admin-panel">
        <h2>Historial por administrador</h2>
        <label>Administrador <select value={actor} onChange={event => setActor(event.target.value)}>
          <option value="">Todos</option>
          {Array.from(new Set([...(institutions ?? []).flatMap(i => i.admins), ...events.map(e => e.actorLogin ?? '')])).filter(Boolean).sort().map(login =>
            <option key={login} value={login}>@{login}</option>)}
        </select></label>
        <ul className="plain-list">{events.filter(e => !actor || e.actorLogin === actor).map(e =>
          <li key={e.id}>{describe(e)} · {e.institution} · {formatDate(e.createdAt)}</li>)}</ul>
        {institutions && !events.some(e => !actor || e.actorLogin === actor) && <p>Sin cambios registrados.</p>}
      </section>
    </div>
  );
}
