import { useCallback, useEffect, useState, type FormEvent } from 'react';

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
  const [adminLogin, setAdminLogin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    { kind: 'ok' | 'error'; text: string } | null
  >(null);

  const load = useCallback(() => {
    api<{ institutions: PlatformInstitution[] }>('/platform/institutions')
      .then(body => setInstitutions(body.institutions))
      .catch(() => setInstitutions([]));
  }, []);

  useEffect(load, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      await api('/platform/institutions', {
        method: 'POST',
        body: { name, slug, firstAdminLogin: adminLogin },
      });
      setMessage({
        kind: 'ok',
        text: `Institución creada. @${adminLogin.replace(/^@/, '')} ya puede administrarla.`,
      });
      setName('');
      setSlug('');
      setSlugTouched(false);
      setAdminLogin('');
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
          <p className="page-kicker">PLATAFORMA</p>
          <h1>Instituciones</h1>
          <p>
            Registra universidades y nombra a su primer
            administrador. Solo las cuentas autorizadas en la
            configuración del servidor ven esta sección.
          </p>
        </div>
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
          <div className="form-field">
            <label htmlFor="platform-admin">
              Usuario de GitHub del primer administrador
            </label>
            <input
              id="platform-admin"
              required
              maxLength={40}
              placeholder="@usuario"
              value={adminLogin}
              onChange={event => setAdminLogin(event.target.value)}
            />
            <span className="field-hint">
              Debe haber iniciado sesión en WebClass al menos una vez.
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
                <AddAdmin institution={item} onAdded={load} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddAdmin({
  institution,
  onAdded,
}: {
  institution: PlatformInstitution;
  onAdded: () => void;
}) {
  const [login, setLogin] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="platform-admins">
      <span className="muted">
        Administradores:{' '}
        {institution.admins.length
          ? institution.admins.map(admin => `@${admin}`).join(', ')
          : 'ninguno'}
      </span>
      <form
        className="inline-form"
        onSubmit={event => {
          event.preventDefault();
          setError(null);
          api(`/platform/institutions/${institution.id}/admins`, {
            method: 'POST',
            body: { adminLogin: login },
          })
            .then(() => {
              setLogin('');
              onAdded();
            })
            .catch(addError =>
              setError(errorMessage(addError, 'No pudimos asignarlo.')),
            );
        }}
      >
        <input
          aria-label={`Nuevo administrador para ${institution.name}`}
          placeholder="@usuario"
          maxLength={40}
          value={login}
          onChange={event => setLogin(event.target.value)}
        />
        <button
          type="submit"
          className="link-button"
          disabled={login.trim() === ''}
        >
          Agregar administrador
        </button>
      </form>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
