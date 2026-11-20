import { ExternalLinkIcon, LogoutIcon } from '../components/icons';
import { Badge, Button, Card, StatusBadge } from '../components/ui';
import { showWelcomeAgain, useWelcomeDismissed } from '../onboarding/welcome-store';
import { primaryRoleLabel } from '../navigation/sections';
import type { CurrentUser } from '../session/session-state';
import { ACCENT_LABELS, THEME_ADJECTIVES } from '../theme/appearance';
import { useAppearance } from '../theme/appearance-store';

/*
 * Mi perfil: solo lectura. Muestra lo que /me ya devuelve. Editar datos
 * académicos o roles no es algo que la persona haga sola: lo decide la
 * administración de la institución, así que aquí no hay botones de editar.
 */

const ROLE_NAMES: Record<string, string> = {
  ADMIN: 'Administrador',
  TEACHER: 'Profesor',
  STUDENT: 'Estudiante',
};

const IDENTITY_LABELS: Record<string, string> = {
  VERIFIED: 'Verificada',
  PENDING: 'En revisión',
  REJECTED: 'Rechazada',
};

export function ProfilePage({
  user,
  activeInstitutionId,
  onOpenAppearance,
  onLogout,
  loggingOut,
}: {
  user: CurrentUser;
  activeInstitutionId: string;
  onOpenAppearance: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const appearance = useAppearance();
  const welcomeDismissed = useWelcomeDismissed();
  const login = user.github.login;
  const displayName = user.academicIdentity?.displayName?.trim();

  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">Ajustes</p>
          <h1>Mi perfil</h1>
          <p>Tu cuenta, tus instituciones y tus preferencias en este navegador.</p>
        </div>
      </section>

      <Card kicker="Cuenta" title="GitHub">
        <div className="profile-identity">
          {user.github.avatarUrl ? (
            <img src={user.github.avatarUrl} alt="" className="profile-identity-avatar" />
          ) : (
            <span className="profile-identity-avatar" aria-hidden="true">
              {login.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="profile-identity-copy">
            {displayName && <strong>{displayName}</strong>}
            <span className={displayName ? undefined : 'is-primary'}>@{login}</span>
            <span className="profile-identity-note">
              Tu foto y tu usuario vienen de GitHub; se cambian allá.
            </span>
          </div>
          <a
            className="profile-external-link"
            href={`https://github.com/${encodeURIComponent(login)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver en GitHub
            <ExternalLinkIcon />
            <span className="visually-hidden"> (se abre en otra pestaña)</span>
          </a>
        </div>
      </Card>

      <Card
        kicker="Instituciones"
        title={user.institutions.length === 1 ? 'Tu institución' : `Tus ${user.institutions.length} instituciones`}
      >
        <ul className="profile-institutions">
          {user.institutions.map(institution => (
            <li key={institution.id}>
              <div className="profile-institution-head">
                <strong>{institution.name}</strong>
                {institution.id === activeInstitutionId && user.institutions.length > 1 && (
                  <Badge tone="accent">Activa</Badge>
                )}
              </div>

              <dl className="profile-facts">
                <div>
                  <dt>Rol</dt>
                  <dd className="profile-roles">
                    {institution.roles.length > 0
                      ? institution.roles.map(role => (
                          <Badge key={role} tone="neutral" dot>
                            {ROLE_NAMES[role] ?? role}
                          </Badge>
                        ))
                      : primaryRoleLabel(institution.roles)}
                  </dd>
                </div>
                <div>
                  <dt>Identidad académica</dt>
                  <dd>
                    {institution.academicIdentity ? (
                      <span className="profile-identity-row">
                        <code>{institution.academicIdentity.institutionalIdentifier}</code>
                        <StatusBadge
                          status={institution.academicIdentity.status}
                          label={IDENTITY_LABELS[institution.academicIdentity.status]}
                        />
                      </span>
                    ) : (
                      <span className="profile-muted">Sin registrar</span>
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <p className="profile-muted">
          Para corregir tu rol o tu código, habla con la administración de la institución.
        </p>
      </Card>

      <Card kicker="Preferencias" title="En este navegador">
        <dl className="profile-facts">
          <div>
            <dt>Apariencia</dt>
            <dd>
              Base {THEME_ADJECTIVES[appearance.theme]} con secundario{' '}
              {ACCENT_LABELS[appearance.accent].toLowerCase()}
            </dd>
          </div>
        </dl>
        <div className="profile-actions">
          <Button variant="secondary" size="sm" onClick={onOpenAppearance}>
            Cambiar apariencia
          </Button>
          <Button variant="ghost" size="sm" onClick={showWelcomeAgain} disabled={!welcomeDismissed}>
            {welcomeDismissed ? 'Mostrar la bienvenida otra vez' : 'La bienvenida está visible en Inicio'}
          </Button>
        </div>
      </Card>

      <Card kicker="Sesión" title="Cerrar sesión">
        <p className="profile-muted">
          Cierra la sesión en este navegador. Para volver a entrar necesitas tu cuenta de GitHub.
        </p>
        <div className="profile-actions">
          <Button
            variant="danger-soft"
            size="sm"
            iconStart={<LogoutIcon />}
            onClick={onLogout}
            loading={loggingOut}
            loadingText="Cerrando sesión…"
          >
            Cerrar sesión
          </Button>
        </div>
      </Card>
    </div>
  );
}
