import {
  StrictMode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';

import {
  AppShell,
  type AdminPage,
} from './components/AppShell';
import { GitHubIcon, InstitutionIcon } from './components/icons';
import { Alert, Card, EmptyState, Spinner, ToastProvider, useToast } from './components/ui';
import { readAuthError, withoutAuthError } from './session/auth-errors';
import {
  DeniedAccessScreen,
  LoadingScreen,
  NoInstitutionScreen,
  PendingAccessScreen,
  RoleUnavailableScreen,
  ServerErrorScreen,
  SessionExpiredScreen,
} from './pages/status/StatusScreens';
import { onSessionExpired } from './session/session-events';
import {
  accessViewFor,
  classifyMeResponse,
  isExpiredSession,
  type CurrentUser,
} from './session/session-state';
import { WelcomePanel } from './onboarding/WelcomePanel';
import { AdminHomePage } from './pages/AdminHomePage';
import { initAppearance } from './theme/appearance-store';

import './styles/tokens.css';
import './style.css';
import './styles/components.css';
// Va al final: traduce los nombres viejos (--vmat-*) a los tokens.
import './styles/compat.css';

/*
 * Inicio va en el archivo principal porque es lo primero que se ve al
 * entrar: diferirlo hacía esperar una segunda descarga (medido: 1,1 s →
 * 1,6 s con 3G). Las demás páginas se descargan al abrirlas y, después de
 * entrar, se precargan en segundo plano (prefetchPages) para que navegar
 * siga siendo instantáneo.
 */
const loadAdminUsers = () => import('./pages/AdminUsersPage');
const loadAdminMembers = () => import('./pages/AdminMembersPage');
const loadAppearance = () => import('./pages/AppearancePage');
const loadProfile = () => import('./pages/ProfilePage');

const AdminUsersPage = lazy(() => loadAdminUsers().then(module => ({ default: module.AdminUsersPage })));
const AdminMembersPage = lazy(() => loadAdminMembers().then(module => ({ default: module.AdminMembersPage })));
const AppearancePage = lazy(() => loadAppearance().then(module => ({ default: module.AppearancePage })));
const ProfilePage = lazy(() => loadProfile().then(module => ({ default: module.ProfilePage })));

function prefetchPages() {
  const run = () => {
    for (const load of [loadAdminUsers, loadAdminMembers, loadAppearance, loadProfile]) {
      void load().catch(() => {
        // Si falla la precarga, la página se descarga al abrirla.
      });
    }
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1500);
  }
}

function PageFallback() {
  return (
    <div className="page-fallback">
      <Spinner size="lg" label="Cargando…" />
    </div>
  );
}

// Solo en desarrollo: en el build de producción esta rama desaparece.
const ComponentCatalogPage = import.meta.env.DEV
  ? lazy(() =>
      import('./pages/ComponentCatalogPage').then(module => ({
        default: module.ComponentCatalogPage,
      })),
    )
  : null;

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'expired' }
  | { status: 'error'; kind: 'server' | 'network'; code: number | null };

/* Cada cuánto, como mínimo, se revisa la sesión al volver a la pestaña. */
const SESSION_RECHECK_MS = 60_000;

/*
 * Sección que todavía no tiene funciones. Dice qué va a haber ahí sin
 * mostrar botones de cosas que no existen.
 */
function UpcomingSectionPage({
  title,
  description,
  upcoming,
}: {
  title: string;
  description: string;
  upcoming: string;
}) {
  return (
    <div className="admin-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">Administración</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>

      <Card>
        <EmptyState icon={<InstitutionIcon />} title="Esta sección todavía no está disponible" size="lg">
          {upcoming}
        </EmptyState>
      </Card>
    </div>
  );
}

let prefetched = false;

/* Precarga las páginas la primera vez que se muestra la aplicación. */
function PrefetchOnce() {
  useEffect(() => {
    if (prefetched) return;
    prefetched = true;
    prefetchPages();
  }, []);
  return null;
}

function LoginScreen() {
  const [authError] = useState(() => readAuthError(window.location.search));
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    document.title = 'Iniciar sesión · WebClass';
    // Se quita ?auth_error= de la URL para que recargar no repita el aviso.
    if (authError) {
      const { pathname, search, hash } = window.location;
      window.history.replaceState(null, '', `${pathname}${withoutAuthError(search)}${hash}`);
    }
  }, [authError]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">
          W
        </div>

        <p className="eyebrow">WebClass</p>

        <h1>Tu aula, conectada con GitHub.</h1>

        <p className="auth-description">
          Gestiona cursos, entregas y repositorios desde un solo lugar.
        </p>

        {authError && (
          <div className="auth-error">
            <Alert tone="danger" title={authError.title}>
              {authError.body}
            </Alert>
          </div>
        )}

        <a
          className="github-button"
          href="/auth/github"
          aria-busy={redirecting || undefined}
          onClick={() => setRedirecting(true)}
        >
          <GitHubIcon />
          Continuar con GitHub
        </a>
        <p className="auth-redirecting" role="status">
          {redirecting ? 'Abriendo GitHub…' : ''}
        </p>

        <p className="auth-note">
          GitHub solo confirma quién eres. Qué puedes hacer en cada institución lo decide su
          administración dentro de WebClass.
        </p>
      </section>
    </main>
  );
}

function App() {
  const toast = useToast();
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [checking, setChecking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activePage, setActivePage] = useState<AdminPage>('home');

  const authRef = useRef(auth);
  authRef.current = auth;
  const lastCheck = useRef(0);

  /*
   * Pide /me y decide el estado. `background` = revisión silenciosa
   * (al volver a la pestaña): si falla la red no se saca a la persona
   * de lo que estaba haciendo, solo se detecta la sesión vencida.
   */
  const loadSession = useCallback(
    async (options: { background?: boolean; signal?: AbortSignal } = {}) => {
      const wasAuthenticated = authRef.current.status === 'authenticated';
      lastCheck.current = Date.now();

      let response: Response;
      try {
        response = await fetch('/me', { credentials: 'same-origin', signal: options.signal });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!options.background) setAuth({ status: 'error', kind: 'network', code: null });
        return;
      }

      const outcome = classifyMeResponse(response.status);

      if (outcome === 'anonymous') {
        setAuth(isExpiredSession(wasAuthenticated, outcome) ? { status: 'expired' } : { status: 'anonymous' });
        return;
      }

      if (outcome === 'server-error') {
        if (!options.background) setAuth({ status: 'error', kind: 'server', code: response.status });
        return;
      }

      try {
        const body = (await response.json()) as { user: CurrentUser };
        setAuth({ status: 'authenticated', user: body.user });
      } catch {
        if (!options.background) setAuth({ status: 'error', kind: 'server', code: response.status });
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSession({ signal: controller.signal });
    return () => controller.abort();
  }, [loadSession]);

  // Al volver a la pestaña se revisa la sesión: así se detecta si venció
  // y una solicitud pendiente que ya fue aprobada aparece sola.
  useEffect(() => {
    function recheck() {
      if (document.visibilityState !== 'visible') return;
      if (authRef.current.status !== 'authenticated') return;
      if (Date.now() - lastCheck.current < SESSION_RECHECK_MS) return;
      void loadSession({ background: true });
    }

    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [loadSession]);

  // Cualquier pantalla puede avisar que el servidor respondió 401.
  useEffect(
    () =>
      onSessionExpired(() => {
        if (authRef.current.status === 'authenticated') setAuth({ status: 'expired' });
      }),
    [],
  );

  async function checkAgain() {
    setChecking(true);
    await loadSession();
    setChecking(false);
  }

  async function logout() {
    setLoggingOut(true);

    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      setActivePage('home');
      setAuth({ status: 'anonymous' });
    } catch {
      // La sesión sigue abierta: se avisa y la persona sigue donde estaba.
      toast({
        tone: 'danger',
        title: 'No pudimos cerrar la sesión',
        description: 'Revisa tu conexión e inténtalo de nuevo.',
      });
    } finally {
      setLoggingOut(false);
    }
  }

  switch (auth.status) {
    case 'loading':
      return <LoadingScreen />;
    case 'anonymous':
      return <LoginScreen />;
    case 'expired':
      return <SessionExpiredScreen />;
    case 'error':
      return (
        <ServerErrorScreen kind={auth.kind} code={auth.code} retrying={checking} onRetry={checkAgain} />
      );
    case 'authenticated':
      break;
  }

  const { user } = auth;
  const view = accessViewFor(user);
  const login = user.github.login;

  switch (view.kind) {
    case 'pending':
      return (
        <PendingAccessScreen
          request={view.request}
          login={login}
          checking={checking}
          onCheckAgain={checkAgain}
          onLogout={logout}
          loggingOut={loggingOut}
        />
      );
    case 'denied':
      return (
        <DeniedAccessScreen request={view.request} login={login} onLogout={logout} loggingOut={loggingOut} />
      );
    case 'no-institution':
      return <NoInstitutionScreen login={login} onLogout={logout} loggingOut={loggingOut} />;
    case 'role-unavailable':
      return (
        <RoleUnavailableScreen
          institution={view.institution}
          login={login}
          onLogout={logout}
          loggingOut={loggingOut}
        />
      );
    case 'app':
      break;
  }

  const { institution } = view;

  // (Se precarga una sola vez por sesión; ver PrefetchOnce.)

  function renderAdminPage() {
    switch (activePage) {
      case 'users':
        return (
          <AdminUsersPage
            institutionId={institution.id}
            institutionName={institution.name}
          />
        );

      case 'teachers':
        return (
          <AdminMembersPage
            institutionId={institution.id}
            institutionName={institution.name}
            role="TEACHER"
          />
        );

      case 'students':
        return (
          <AdminMembersPage
            institutionId={institution.id}
            institutionName={institution.name}
            role="STUDENT"
          />
        );

      case 'appearance':
        return <AppearancePage />;

      case 'profile':
        return (
          <ProfilePage
            user={user}
            activeInstitutionId={institution.id}
            onOpenAppearance={() => setActivePage('appearance')}
            onLogout={logout}
            loggingOut={loggingOut}
          />
        );

      case 'components':
        if (ComponentCatalogPage) {
          return (
            <Suspense fallback={<Spinner size="lg" label="Cargando catálogo…" />}>
              <ComponentCatalogPage />
            </Suspense>
          );
        }
        return null;

      case 'institution':
        return (
          <UpcomingSectionPage
            title="Institución"
            description={`Configuración de ${institution.name}.`}
            upcoming="Aquí vas a poder consultar y editar el nombre, la descripción y los dominios autorizados de la institución."
          />
        );

      case 'home':
      default:
        return (
          <>
            <WelcomePanel
              firstName={user.academicIdentity?.displayName?.split(' ')[0] || user.github.login}
              onOpenAppearance={() => setActivePage('appearance')}
            />
            <AdminHomePage
              institutionName={institution.name}
              githubLogin={user.github.login}
            />
          </>
        );
    }
  }

  return (
    <AppShell
      activePage={activePage}
      onNavigate={setActivePage}
      githubLogin={user.github.login}
      avatarUrl={user.github.avatarUrl}
      institutionName={institution.name}
      roles={institution.roles}
      loggingOut={loggingOut}
      onLogout={logout}
    >
      <PrefetchOnce />
      <Suspense fallback={<PageFallback />}>{renderAdminPage()}</Suspense>
    </AppShell>
  );
}

// Base y secundario se aplican antes del primer render, también en el login.
initAppearance();

createRoot(
  document.getElementById('root')!,
).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
