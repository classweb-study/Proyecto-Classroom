import { useEffect, useState, type FormEvent } from 'react';

import { api, errorMessage } from '../lib/api';

type Profile = {
  displayName: string | null;
  contactEmail: string | null;
  notifyDeadlines: boolean;
  notifyFeedback: boolean;
};

type Membership = {
  id: string;
  name: string;
  roles: string[];
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  TEACHER: 'Profesor',
  STUDENT: 'Estudiante',
};

type ProfilePageProps = {
  githubLogin: string;
  avatarUrl: string | null;
  institutions: Membership[];
  onOpenRequests: () => void;
};

export function ProfilePage({
  githubLogin,
  avatarUrl,
  institutions,
  onOpenRequests,
}: ProfilePageProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    { kind: 'ok' | 'error'; text: string } | null
  >(null);

  useEffect(() => {
    api<{ profile: Profile }>('/me/profile')
      .then(body => setProfile(body.profile))
      .catch(() => setLoadFailed(true));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;

    setSaving(true);
    setMessage(null);

    try {
      await api('/me/profile', { method: 'PATCH', body: profile });
      setMessage({ kind: 'ok', text: 'Perfil guardado.' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: errorMessage(error, 'No pudimos guardar el perfil.'),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">MI CUENTA</p>
          <h1>Perfil</h1>
          <p>
            Tus datos, preferencias y la institución a la que
            perteneces.
          </p>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="page-kicker">IDENTIDAD</p>
            <h2>Cuenta de GitHub</h2>
          </div>
        </div>

        <div className="profile-identity">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            <div className="request-avatar">
              {githubLogin.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <strong>@{githubLogin}</strong>
            <span className="muted">
              Iniciaste sesión con GitHub. WebClass solo usa tu
              identidad pública (usuario y avatar); no crea ni
              modifica repositorios sin tu permiso.
            </span>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="page-kicker">MEMBRESÍAS</p>
            <h2>Instituciones</h2>
          </div>
          <button
            type="button"
            className="secondary-action"
            onClick={onOpenRequests}
          >
            Mis solicitudes
          </button>
        </div>

        {institutions.length === 0 ? (
          <p className="field-hint">
            Todavía no perteneces a ninguna institución.
          </p>
        ) : (
          <ul className="plain-list">
            {institutions.map(item => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span className="pill-row">
                  {item.roles.map(role => (
                    <span key={role} className="status-pill active">
                      {ROLE_LABEL[role] ?? role}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="page-kicker">DATOS Y PREFERENCIAS</p>
            <h2>Información personal</h2>
          </div>
        </div>

        {loadFailed && (
          <p className="form-error" role="alert">
            No pudimos cargar tu perfil.
          </p>
        )}

        {!profile && !loadFailed && (
          <div className="admin-loading">
            <div className="loader" />
            <span>Cargando perfil…</span>
          </div>
        )}

        {profile && (
          <form className="stack-form" onSubmit={save}>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="profile-name">Nombre para mostrar</label>
                <input
                  id="profile-name"
                  maxLength={120}
                  autoComplete="name"
                  value={profile.displayName ?? ''}
                  onChange={event =>
                    setProfile({
                      ...profile,
                      displayName: event.target.value,
                    })
                  }
                />
              </div>

              <div className="form-field">
                <label htmlFor="profile-email">
                  Correo de contacto (privado)
                </label>
                <input
                  id="profile-email"
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  value={profile.contactEmail ?? ''}
                  onChange={event =>
                    setProfile({
                      ...profile,
                      contactEmail: event.target.value,
                    })
                  }
                />
                <span className="field-hint">
                  No se muestra a otros usuarios.
                </span>
              </div>
            </div>

            <fieldset className="check-group">
              <legend>Avisos en el inicio</legend>
              <label>
                <input
                  type="checkbox"
                  checked={profile.notifyDeadlines}
                  onChange={event =>
                    setProfile({
                      ...profile,
                      notifyDeadlines: event.target.checked,
                    })
                  }
                />
                Próximos vencimientos y entregas atrasadas
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={profile.notifyFeedback}
                  onChange={event =>
                    setProfile({
                      ...profile,
                      notifyFeedback: event.target.checked,
                    })
                  }
                />
                Retroalimentación y calificaciones nuevas
              </label>
            </fieldset>

            {message && (
              <p
                className={message.kind === 'ok' ? 'form-success' : 'form-error'}
                role="status"
              >
                {message.text}
              </p>
            )}

            <div className="form-actions">
              <button
                type="submit"
                className="primary-action"
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
