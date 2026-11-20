import { useEffect, useId, type ReactNode } from 'react';

import {
  ErrorIcon,
  GitHubIcon,
  InfoIcon,
  InstitutionIcon,
  LogoutIcon,
  WarningIcon,
} from '../../components/icons';
import { Alert, Badge, Button, Spinner } from '../../components/ui';
import { cx } from '../../components/ui/logic';
import {
  emailKind,
  roleName,
  type AccessRequestSummary,
  type UserInstitution,
} from '../../session/session-state';

/*
 * Pantallas que se ven fuera de la aplicación: cargando, solicitud
 * pendiente o rechazada, sin institución, rol sin interfaz, sesión
 * terminada y errores del servidor o de conexión.
 *
 * Regla de textos (STYLEGUIDE.md): decir qué pasó y qué puede hacer la
 * persona, sin detalles técnicos y sin prometer funciones que no existen.
 */

type Tone = 'info' | 'warning' | 'danger' | 'neutral';

const TONE_ICONS: Record<Tone, ReactNode> = {
  info: <InfoIcon />,
  warning: <WarningIcon />,
  danger: <ErrorIcon />,
  neutral: <InstitutionIcon />,
};

function StatusScreen({
  tone,
  title,
  children,
  actions,
  footer,
}: {
  tone: Tone;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();

  // El título de la pestaña dice en qué pantalla está la persona.
  useEffect(() => {
    document.title = `${title} · WebClass`;
  }, [title]);

  return (
    <main className="center-screen">
      <section className="status-card" aria-labelledby={titleId}>
        <div className="status-card-brand" aria-hidden="true">
          <span className="vmat-logo">W</span>
          <span>WebClass</span>
        </div>
        <span className={cx('status-icon', `status-icon--${tone}`)} aria-hidden="true">
          {TONE_ICONS[tone]}
        </span>
        <h1 id={titleId}>{title}</h1>
        <div className="status-body">{children}</div>
        {actions && <div className="status-actions">{actions}</div>}
        {footer && <p className="status-footer">{footer}</p>}
      </section>
    </main>
  );
}

function SignedInAs({ login }: { login: string }) {
  return (
    <>
      Sesión iniciada con GitHub como <strong>@{login}</strong>.
    </>
  );
}

function LogoutButton({ onLogout, loggingOut }: { onLogout: () => void; loggingOut: boolean }) {
  return (
    <Button
      variant="secondary"
      iconStart={<LogoutIcon />}
      onClick={onLogout}
      loading={loggingOut}
      loadingText="Cerrando sesión…"
    >
      Cerrar sesión
    </Button>
  );
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(date);
}

/* ---------- Cargando ---------- */

export function LoadingScreen() {
  return (
    <main className="center-screen">
      <Spinner size="lg" label="Cargando WebClass…" />
    </main>
  );
}

/* ---------- Solicitud pendiente ---------- */

export function PendingAccessScreen({
  request,
  login,
  checking,
  onCheckAgain,
  onLogout,
  loggingOut,
}: {
  request: AccessRequestSummary;
  login: string;
  checking: boolean;
  onCheckAgain: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const role = roleName(request.assignedRole);
  const date = formatDate(request.createdAt);
  const personalEmail = request.contactEmail && emailKind(request.contactEmail) === 'personal';

  return (
    <StatusScreen
      tone="warning"
      title="Tu solicitud está en revisión"
      actions={
        <>
          <Button variant="primary" onClick={onCheckAgain} loading={checking} loadingText="Revisando…">
            Revisar de nuevo
          </Button>
          <LogoutButton onLogout={onLogout} loggingOut={loggingOut} />
        </>
      }
      footer={<SignedInAs login={login} />}
    >
      <p>
        Pediste acceso a <strong>{request.institution.name}</strong>
        {role ? ` como ${role}` : ''}. Un administrador de esa institución tiene que aprobarla
        antes de que puedas entrar.
      </p>

      <dl className="status-details">
        <div>
          <dt>Estado</dt>
          <dd>
            <Badge tone="warning">Pendiente</Badge>
          </dd>
        </div>
        {date && (
          <div>
            <dt>Enviada</dt>
            <dd>{date}</dd>
          </div>
        )}
        {request.contactEmail && (
          <div>
            <dt>Correo de contacto</dt>
            <dd>{request.contactEmail}</dd>
          </div>
        )}
      </dl>

      {personalEmail && (
        <Alert tone="info" title="Usaste un correo personal">
          Se puede pedir acceso con Gmail u otro correo, pero el administrador no puede comprobar con él
          que perteneces a la institución. Es posible que te pida un dato más, como tu código
          universitario.
        </Alert>
      )}

      <p className="status-hint">
        No tienes que volver a enviarla. Cuando la aprueben, al entrar de nuevo verás tu espacio
        de trabajo; también puedes usar «Revisar de nuevo».
      </p>
    </StatusScreen>
  );
}

/* ---------- Solicitud rechazada ---------- */

export function DeniedAccessScreen({
  request,
  login,
  onLogout,
  loggingOut,
}: {
  request: AccessRequestSummary;
  login: string;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const reason = (request.reason ?? request.decisionReason)?.trim();

  return (
    <StatusScreen
      tone="danger"
      title="No se aprobó tu acceso"
      actions={<LogoutButton onLogout={onLogout} loggingOut={loggingOut} />}
      footer={<SignedInAs login={login} />}
    >
      <p>
        La administración de <strong>{request.institution.name}</strong> rechazó tu solicitud.
      </p>

      {reason ? (
        <Alert tone="warning" title="Motivo que indicó la institución">
          {reason}
        </Alert>
      ) : (
        <p className="status-hint">La institución no indicó un motivo.</p>
      )}

      <ul className="status-steps">
        <li>
          Si estudias o trabajas en otra universidad, solicita acceso a tu institución
          correspondiente.
        </li>
        <li>
          Si crees que es un error, habla directamente con la administración de{' '}
          {request.institution.name}.
        </li>
      </ul>
    </StatusScreen>
  );
}

/* ---------- Sin institución ---------- */

export function NoInstitutionScreen({
  login,
  onLogout,
  loggingOut,
}: {
  login: string;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  return (
    <StatusScreen
      tone="neutral"
      title="Tu cuenta todavía no pertenece a una institución"
      actions={<LogoutButton onLogout={onLogout} loggingOut={loggingOut} />}
      footer={<SignedInAs login={login} />}
    >
      <p>
        Iniciaste sesión, pero no eres miembro de ninguna institución y no tienes una solicitud de
        acceso en curso.
      </p>
      <p className="status-hint">
        Para usar WebClass, una institución tiene que darte acceso. Pregunta a la administración de tu
        universidad cómo entrar.
      </p>
    </StatusScreen>
  );
}

/* ---------- Rol sin interfaz todavía ---------- */

export function RoleUnavailableScreen({
  institution,
  login,
  onLogout,
  loggingOut,
}: {
  institution: UserInstitution;
  login: string;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const roles = institution.roles
    .map(role => (role === 'TEACHER' ? 'profesor' : role === 'STUDENT' ? 'estudiante' : null))
    .filter(Boolean);
  const roleText = roles.length > 0 ? roles.join(' y ') : 'miembro';

  return (
    <StatusScreen
      tone="info"
      title="Tu espacio todavía no está listo"
      actions={<LogoutButton onLogout={onLogout} loggingOut={loggingOut} />}
      footer={<SignedInAs login={login} />}
    >
      <p>
        Ya perteneces a <strong>{institution.name}</strong> como {roleText}. La interfaz para ese rol
        se está construyendo y todavía no se puede usar.
      </p>
      <p className="status-hint">Tu acceso está guardado: no tienes que hacer nada más.</p>
    </StatusScreen>
  );
}

/* ---------- Sesión terminada ---------- */

export function SessionExpiredScreen() {
  return (
    <StatusScreen
      tone="info"
      title="Tu sesión terminó"
      actions={
        <a className="github-button" href="/auth/github">
          <GitHubIcon />
          Volver a entrar con GitHub
        </a>
      }
    >
      <p>
        La sesión venció o se cerró desde otro lugar. Por seguridad, tienes que volver a entrar
        para seguir.
      </p>
    </StatusScreen>
  );
}

/* ---------- Error del servidor o de conexión ---------- */

export function ServerErrorScreen({
  kind,
  code,
  retrying,
  onRetry,
}: {
  kind: 'server' | 'network';
  code?: number | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  const network = kind === 'network';

  return (
    <StatusScreen
      tone="danger"
      // El título sin conexión es el que comprueba el E2E de Jero (tests/e2e/bootstrap.spec.ts).
      title={network ? 'No pudimos cargar tu sesión.' : 'WebClass tiene un problema en este momento'}
      actions={
        <Button variant="primary" onClick={onRetry} loading={retrying} loadingText="Reintentando…">
          Reintentar
        </Button>
      }
      footer={!network && code ? `Código del error: ${code}. Compártelo si reportas el problema.` : undefined}
    >
      {network ? (
        <p>No logramos conectarnos con WebClass. Revisa tu conexión a internet e inténtalo de nuevo.</p>
      ) : (
        <p>
          El problema es del servidor, no de tu cuenta. Inténtalo de nuevo en unos minutos.
        </p>
      )}
    </StatusScreen>
  );
}
