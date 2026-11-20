import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Domain = { id: string; domain: string };

type Overview = {
  institution: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    accentColor: string | null;
  };
  domains: Domain[];
};

type AdminInstitutionPageProps = {
  institutionId: string;
  onInstitutionRenamed: () => void;
};

const DOMAIN_ERRORS: Record<string, string> = {
  INVALID_DOMAIN: 'Escribe un dominio válido, por ejemplo unisabana.edu.co.',
  DOMAIN_ALREADY_EXISTS: 'Ese dominio ya está registrado.',
};

export function AdminInstitutionPage({
  institutionId,
  onInstitutionRenamed,
}: AdminInstitutionPageProps) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [newDomain, setNewDomain] = useState('');
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/admin/institutions/${institutionId}`,
        { credentials: 'same-origin' },
      );

      if (!response.ok) {
        throw new Error('Load failed');
      }

      const body = (await response.json()) as Overview;
      setOverview(body);
      setName(body.institution.name);
      setDescription(body.institution.description ?? '');
      setLogoUrl(body.institution.logoUrl ?? '');
      setAccentColor(body.institution.accentColor ?? '');
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [institutionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch(
        `/admin/institutions/${institutionId}`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description,
            logoUrl,
            accentColor,
          }),
        },
      );

      if (!response.ok) {
        throw new Error('Save failed');
      }

      setSaveMessage('Cambios guardados.');

      if (
        name.trim() !== overview?.institution.name ||
        logoUrl !== (overview?.institution.logoUrl ?? '') ||
        accentColor !== (overview?.institution.accentColor ?? '')
      ) {
        onInstitutionRenamed();
      }

      await load();
    } catch {
      setSaveMessage(
        'No pudimos guardar. El nombre debe tener entre 2 y 120 caracteres, el logo debe ser un enlace https:// y el color tener el formato #RRGGBB.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function addDomain(event: FormEvent) {
    event.preventDefault();
    setDomainBusy(true);
    setDomainError(null);

    try {
      const response = await fetch(
        `/admin/institutions/${institutionId}/domains`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: newDomain }),
        },
      );

      if (!response.ok) {
        const body = (await response
          .json()
          .catch(() => ({}))) as { error?: string };

        setDomainError(
          (body.error && DOMAIN_ERRORS[body.error]) ??
            'No pudimos agregar el dominio.',
        );
        return;
      }

      setNewDomain('');
      await load();
    } catch {
      setDomainError('No pudimos agregar el dominio.');
    } finally {
      setDomainBusy(false);
    }
  }

  async function removeDomain(domain: Domain) {
    setDomainBusy(true);
    setDomainError(null);

    try {
      const response = await fetch(
        `/admin/institutions/${institutionId}/domains/${domain.id}`,
        {
          method: 'DELETE',
          credentials: 'same-origin',
        },
      );

      if (!response.ok) {
        throw new Error('Remove failed');
      }

      await load();
    } catch {
      setDomainError(`No pudimos quitar ${domain.domain}.`);
    } finally {
      setDomainBusy(false);
    }
  }

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">ADMINISTRACIÓN</p>
          <h1>Institución</h1>
          <p>
            Información pública de la institución y dominios de
            correo que ayudan a revisar solicitudes.
          </p>
        </div>
      </section>

      {loadFailed && (
        <div className="admin-error-state">
          <strong>No pudimos cargar la institución.</strong>
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}

      {!overview && !loadFailed && (
        <div className="admin-loading">
          <div className="loader" />
          <span>Cargando institución…</span>
        </div>
      )}

      {overview && (
        <>
          <section className="admin-panel">
            <form className="access-form plain" onSubmit={save}>
              <div className="access-form-heading">
                <p className="page-kicker">INFORMACIÓN</p>
                <h2>Datos de la institución</h2>
              </div>

              <div className="form-field">
                <label htmlFor="institution-name">Nombre</label>
                <input
                  id="institution-name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={event => setName(event.target.value)}
                />
              </div>

              <div className="form-field">
                <label htmlFor="institution-description">
                  Descripción (opcional)
                </label>
                <textarea
                  id="institution-description"
                  maxLength={2000}
                  rows={3}
                  value={description}
                  onChange={event =>
                    setDescription(event.target.value)
                  }
                />
              </div>

              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="institution-logo">
                    Logo (enlace https, opcional)
                  </label>
                  <input
                    id="institution-logo"
                    type="url"
                    maxLength={500}
                    placeholder="https://…/logo.png"
                    value={logoUrl}
                    onChange={event => setLogoUrl(event.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="institution-accent">
                    Color institucional (opcional)
                  </label>
                  <div className="color-field">
                    <input
                      type="color"
                      aria-label="Elegir color"
                      value={accentColor || '#169c5a'}
                      onChange={event =>
                        setAccentColor(event.target.value)
                      }
                    />
                    <input
                      id="institution-accent"
                      maxLength={7}
                      placeholder="#169c5a"
                      value={accentColor}
                      onChange={event =>
                        setAccentColor(event.target.value)
                      }
                    />
                    {accentColor && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setAccentColor('')}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {logoUrl.startsWith('https://') && (
                <div className="logo-preview">
                  <img src={logoUrl} alt="Vista previa del logo" />
                </div>
              )}

              <span className="field-hint">
                Identificador: {overview.institution.slug}. El logo y
                el color se muestran en la barra lateral de todos los
                miembros.
              </span>

              {saveMessage && (
                <p className="field-hint" role="status">
                  {saveMessage}
                </p>
              )}

              <div className="form-actions">
                <button
                  type="submit"
                  className="primary-action"
                  disabled={saving}
                >
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="page-kicker">DOMINIOS</p>
                <h2>Dominios de correo autorizados</h2>
              </div>
            </div>

            <p className="field-hint">
              Si el correo de una solicitud termina en uno de estos
              dominios, la bandeja lo marcará. Es solo una pista:
              la decisión siempre la toma un administrador.
            </p>

            {overview.domains.length === 0 ? (
              <p className="muted">No hay dominios registrados.</p>
            ) : (
              <ul className="domain-list">
                {overview.domains.map(domain => (
                  <li key={domain.id}>
                    <span>@{domain.domain}</span>
                    <button
                      type="button"
                      className="deny-button"
                      disabled={domainBusy}
                      onClick={() => void removeDomain(domain)}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form className="domain-form" onSubmit={addDomain}>
              <label htmlFor="new-domain" className="visually-hidden">
                Nuevo dominio
              </label>
              <input
                id="new-domain"
                placeholder="unisabana.edu.co"
                maxLength={253}
                value={newDomain}
                onChange={event => setNewDomain(event.target.value)}
              />
              <button
                type="submit"
                className="primary-action"
                disabled={domainBusy || newDomain.trim() === ''}
              >
                Agregar
              </button>
            </form>

            {domainError && (
              <p className="form-error" role="alert">
                {domainError}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
