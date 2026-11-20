import { useState } from 'react';

import { CheckIcon } from '../components/icons';

import {
  ACCENTS,
  ACCENT_LABELS,
  DEFAULT_APPEARANCE,
  THEMES,
  THEME_ADJECTIVES,
  THEME_DESCRIPTIONS,
  THEME_LABELS,
  accentChangeNotice,
  accentUnavailableReason,
  fallbackAccent,
  isAccentAllowed,
  isDefaultAppearance,
  type Accent,
  type Theme,
} from '../theme/appearance';
import {
  resetAppearance,
  setAppearance,
  useAppearance,
} from '../theme/appearance-store';


/* Maqueta mínima de la app pintada con otra base. Solo decorativa. */
function ThemeThumbnail({
  theme,
  accent,
}: {
  theme: Theme;
  accent: Accent;
}) {
  return (
    <div
      className="theme-thumb"
      data-theme={theme}
      data-accent={fallbackAccent(theme, accent)}
      aria-hidden="true"
    >
      <div className="theme-thumb-sidebar">
        <span className="theme-thumb-logo" />
        <span className="theme-thumb-nav active" />
        <span className="theme-thumb-nav" />
        <span className="theme-thumb-nav" />
      </div>
      <div className="theme-thumb-main">
        <span className="theme-thumb-topbar" />
        <div className="theme-thumb-card">
          <span className="theme-thumb-line strong" />
          <span className="theme-thumb-line" />
          <span className="theme-thumb-button" />
        </div>
      </div>
    </div>
  );
}

/*
 * Un círculo bloqueado igual debe mostrar su color real, así que se pinta
 * con una base donde ese secundario sí existe.
 */
function swatchTheme(theme: Theme, accent: Accent): Theme {
  if (isAccentAllowed(theme, accent)) return theme;
  return accent === 'white' ? 'dark' : 'light';
}

export function AppearancePage() {
  const appearance = useAppearance();
  const [notice, setNotice] = useState<string | null>(null);

  function chooseTheme(theme: Theme) {
    setNotice(accentChangeNotice(appearance, theme));
    setAppearance({ theme });
  }

  function chooseAccent(accent: Accent) {
    setNotice(null);
    setAppearance({ accent });
  }

  function restore() {
    resetAppearance();
    setNotice(
      `Volvimos a la base ${THEME_ADJECTIVES[DEFAULT_APPEARANCE.theme]} con secundario ${ACCENT_LABELS[DEFAULT_APPEARANCE.accent].toLowerCase()}.`,
    );
  }

  const unavailable = ACCENTS.map(accent =>
    accentUnavailableReason(appearance.theme, accent),
  ).filter((reason): reason is string => reason !== null);

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">Ajustes</p>
          <h1>Apariencia</h1>
          <p>
            Elige los colores de WebClass. Los cambios se aplican al momento y se
            guardan en este navegador.
          </p>
        </div>
      </section>

      <section className="admin-panel">
        <fieldset className="appearance-fieldset">
          <legend>
            <span className="page-kicker">Color base</span>
            <span className="appearance-legend-title">Fondo de la aplicación</span>
          </legend>

          <div className="theme-options">
            {THEMES.map(theme => {
              const selected = appearance.theme === theme;

              return (
                <label
                  key={theme}
                  className={selected ? 'theme-option selected' : 'theme-option'}
                >
                  <input
                    type="radio"
                    name="appearance-theme"
                    value={theme}
                    checked={selected}
                    onChange={() => chooseTheme(theme)}
                    className="visually-hidden"
                  />
                  <ThemeThumbnail theme={theme} accent={appearance.accent} />
                  <span className="theme-option-copy">
                    <strong>{THEME_LABELS[theme]}</strong>
                    <span>{THEME_DESCRIPTIONS[theme]}</span>
                  </span>
                  <span className="option-check">
                    <CheckIcon />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section className="admin-panel">
        <fieldset className="appearance-fieldset">
          <legend>
            <span className="page-kicker">Color secundario</span>
            <span className="appearance-legend-title">
              Botones, menú activo y detalles
            </span>
          </legend>

          <div className="accent-options">
            {ACCENTS.map(accent => {
              const allowed = isAccentAllowed(appearance.theme, accent);
              const selected = appearance.accent === accent;
              const classes = ['accent-option'];
              if (selected) classes.push('selected');
              if (!allowed) classes.push('disabled');

              return (
                <label
                  key={accent}
                  className={classes.join(' ')}
                  title={
                    allowed
                      ? undefined
                      : (accentUnavailableReason(appearance.theme, accent) ??
                        undefined)
                  }
                >
                  <input
                    type="radio"
                    name="appearance-accent"
                    value={accent}
                    checked={selected}
                    disabled={!allowed}
                    onChange={() => chooseAccent(accent)}
                    className="visually-hidden"
                  />
                  <span
                    className="accent-swatch"
                    data-theme={swatchTheme(appearance.theme, accent)}
                    data-accent={accent}
                    aria-hidden="true"
                  >
                    <CheckIcon />
                  </span>
                  <span className="accent-name">
                    {ACCENT_LABELS[accent]}
                    {!allowed && (
                      <span className="visually-hidden">
                        {' '}
                        (no disponible con esta base)
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          {unavailable.length > 0 && (
            <p className="appearance-help">{unavailable.join(' ')}</p>
          )}
        </fieldset>

        <p className="appearance-notice" role="status" aria-live="polite">
          {notice}
        </p>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="page-kicker">Vista previa</p>
            <h2>Así se ve con tu selección</h2>
          </div>
        </div>

        <div className="appearance-preview" aria-hidden="true">
          <div className="appearance-preview-row">
            <span className="request-avatar">M</span>
            <span className="appearance-preview-user">
              <strong>@usuario-ejemplo</strong>
              <span>Solicitud de acceso</span>
            </span>
            <span className="status-pill pending">Pendiente</span>
            <span className="appearance-preview-actions">
              <span className="approve-button">Profesor</span>
              <span className="approve-button secondary">Estudiante</span>
              <span className="deny-button">Denegar</span>
            </span>
          </div>

          <div className="appearance-preview-row">
            <span className="vmat-nav-item active">Elemento activo del menú</span>
            <span className="status-pill active">Estudiante</span>
            <span className="topbar-role">
              <span className="role-dot" />
              Administrador
            </span>
          </div>
        </div>
        <p className="appearance-help">
          Es solo un ejemplo: estos botones no hacen nada.
        </p>
      </section>

      <section className="appearance-footer">
        <p>
          Predeterminado: base {THEME_ADJECTIVES[DEFAULT_APPEARANCE.theme]}{' '}
          con secundario {ACCENT_LABELS[DEFAULT_APPEARANCE.accent].toLowerCase()}.
        </p>
        <button
          type="button"
          className="logout-button"
          onClick={restore}
          disabled={isDefaultAppearance(appearance)}
        >
          Restaurar predeterminados
        </button>
      </section>
    </div>
  );
}
