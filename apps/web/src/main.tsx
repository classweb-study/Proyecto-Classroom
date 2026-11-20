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
  type AppPage,
  type ViewRole,
} from './components/AppShell';
import { GitHubIcon } from './components/icons';
import { Alert, Spinner, ToastProvider, useToast } from './components/ui';
import { canOpen } from './navigation/sections';
import { WelcomePanel } from './onboarding/WelcomePanel';
import { AdminHomePage } from './pages/AdminHomePage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminMembersPage } from './pages/AdminMembersPage';
import { AccessRequestsPage } from './pages/AccessRequestsPage';
import { AdminInstitutionPage } from './pages/AdminInstitutionPage';
import { AppearancePage } from './pages/AppearancePage';
import { CoursesSection } from './pages/CoursesPage';
import { StudentHomePage, TeacherHomePage } from './pages/HomeDashboards';
import { PlatformPage } from './pages/PlatformPage';
import { ProfilePage } from './pages/ProfilePage';
import {
  LoadingScreen,
  ServerErrorScreen,
  SessionExpiredScreen,
} from './pages/status/StatusScreens';
import { readAuthError, withoutAuthError } from './session/auth-errors';
import { onSessionExpired } from './session/session-events';
import { classifyMeResponse, isExpiredSession } from './session/session-state';
import { initAppearance } from './theme/appearance-store';
import type { Navigate } from './lib/api';

import './styles/tokens.css';
import './style.css';
import './styles/components.css';
// Va al final: traduce los nombres viejos (--vmat-*) a los tokens.
import './styles/compat.css';

// Solo en desarrollo: en el build de producción esta rama desaparece.
const ComponentCatalogPage = import.meta.env.DEV
  ? lazy(() =>
      import('./pages/ComponentCatalogPage').then(module => ({
        default: module.ComponentCatalogPage,
      })),
    )
  : null;

const ACTIVE_INSTITUTION_KEY = 'vmat-active-institution';
const VIEW_ROLE_KEY = 'vmat-view-role';

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Remembering the choice is a convenience; switching still works without it.
  }
}

type InstitutionRole = 'ADMIN' | 'TEACHER' | 'STUDENT';
type AcademicIdentityStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED';

type CurrentUser = {
  id: string;
  github: {
    id: string;
    login: string;
    avatarUrl: string | null;
  };
  academicIdentity: null | {
    displayName?: string;
  };
  isPlatformAdmin?: boolean;
  institutions: Array<{
    id: string;
    name: string;
    slug: string;
    roles: InstitutionRole[];
    logoUrl?: string | null;
    accentColor?: string | null;
    academicIdentity: null | {
      institutionalIdentifier: string;
      status: AcademicIdentityStatus;
    };
  }>;
};

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'expired' }
  | { status: 'error'; kind: 'server' | 'network'; code: number | null };

type View = {
  page: AppPage;
  courseId?: string;
  activityId?: string;
};

const ROLE_PRIORITY: ViewRole[] = ['ADMIN', 'TEACHER', 'STUDENT'];

/* Cada cuánto, como mínimo, se revisa la sesión al volver a la pestaña. */
const SESSION_RECHECK_MS = 60_000;

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
  const [view, setView] = useState<View>({ page: 'home' });
  const [activeInstitutionId, setActiveInstitutionId] =
    useState<string | null>(() => readStored(ACTIVE_INSTITUTION_KEY));
  const [preferredRole, setPreferredRole] = useState<string | null>(() =>
    readStored(VIEW_ROLE_KEY),
  );
  const [platformOnly, setPlatformOnly] = useState(true);

  const authRef = useRef(auth);
  authRef.current = auth;
  const lastCheck = useRef(0);

  function switchInstitution(institutionId: string) {
    // Switching never carries course or request ids across institutions.
    setActiveInstitutionId(institutionId);
    store(ACTIVE_INSTITUTION_KEY, institutionId);
    setView({ page: 'home' });
  }

  function switchRole(role: ViewRole) {
    setPreferredRole(role);
    store(VIEW_ROLE_KEY, role);
    setView({ page: 'home' });
  }

  const navigate: Navigate = target => {
    setView({
      page: target.page as AppPage,
      courseId: target.courseId,
      activityId: target.activityId,
    });
    window.scrollTo({ top: 0 });
  };

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
  // y una solicitud que ya fue aprobada aparece sola.
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

  useEffect(() => {
    function signedOutElsewhere(event: StorageEvent) {
      if (event.key === 'webclass-logout') window.location.replace('/');
    }
    window.addEventListener('storage', signedOutElsewhere);
    return () => window.removeEventListener('storage', signedOutElsewhere);
  }, []);

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

      try {
        localStorage.removeItem(ACTIVE_INSTITUTION_KEY);
        localStorage.removeItem(VIEW_ROLE_KEY);
        localStorage.setItem('webclass-logout', String(Date.now()));
      } catch {
        // The server already revoked this session even if storage is disabled.
      }
      window.location.replace('/');
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
  const isPlatformAdmin = user.isPlatformAdmin === true;
  const institution =
    user.institutions.find(
      item => item.id === activeInstitutionId,
    ) ?? user.institutions[0];

  // Without an approved institution the only things available are the
  // request flow and, for platform admins, institution registration.
  if (!institution) {
    if (platformOnly && isPlatformAdmin) {
      return (
        <main className="access-requests-page">
          <button
            type="button"
            className="link-button back-link"
            onClick={() => setPlatformOnly(false)}
          >
            ← Mis solicitudes
          </button>
          <PlatformPage onChanged={() => void loadSession()} />
        </main>
      );
    }

    return (
      <AccessRequestsPage
        githubLogin={user.github.login}
        loggingOut={loggingOut}
        onLogout={logout}
        onOpenPlatform={
          isPlatformAdmin ? () => setPlatformOnly(true) : undefined
        }
      />
    );
  }

  const viewRole: ViewRole =
    ROLE_PRIORITY.find(
      role =>
        role === preferredRole && institution.roles.includes(role),
    ) ??
    ROLE_PRIORITY.find(role => institution.roles.includes(role)) ??
    'STUDENT';

  // A page from another role (e.g. after switching) falls back to home.
  const page: AppPage = canOpen(view.page, viewRole, isPlatformAdmin, import.meta.env.DEV)
    ? view.page
    : 'home';

  const firstName = user.academicIdentity?.displayName?.split(' ')[0] || user.github.login;

  function renderPage() {
    switch (page) {
      case 'profile':
        return (
          <ProfilePage
            githubLogin={user.github.login}
            avatarUrl={user.github.avatarUrl}
            institutions={user.institutions}
            onOpenRequests={() => navigate({ page: 'requests' })}
          />
        );

      case 'requests':
        return (
          <AccessRequestsPage
            embedded
            githubLogin={user.github.login}
            loggingOut={loggingOut}
            onLogout={logout}
          />
        );

      case 'appearance':
        return <AppearancePage />;

      case 'platform':
        return <PlatformPage onChanged={() => void loadSession()} />;

      case 'components':
        if (ComponentCatalogPage) {
          return (
            <Suspense fallback={<Spinner size="lg" label="Cargando catálogo…" />}>
              <ComponentCatalogPage />
            </Suspense>
          );
        }
        return null;

      case 'courses':
        return (
          <CoursesSection
            key={`${institution.id}-${viewRole}`}
            institutionId={institution.id}
            role={viewRole === 'TEACHER' ? 'TEACHER' : 'STUDENT'}
            courseId={view.courseId}
            activityId={view.activityId}
            navigate={navigate}
          />
        );

      case 'users':
      case 'teachers':
      case 'students':
        return (
          <>
            <label className="form-field">
              Filtrar por institución
              <select value={institution.id} onChange={event => {
                setActiveInstitutionId(event.target.value);
                store(ACTIVE_INSTITUTION_KEY, event.target.value);
                setPreferredRole('ADMIN');
                store(VIEW_ROLE_KEY, 'ADMIN');
              }}>
                {user.institutions.filter(item => item.roles.includes('ADMIN')).map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            {page === 'users' ? (
              <AdminUsersPage
                key={institution.id}
                institutionId={institution.id}
                institutionName={institution.name}
              />
            ) : (
              <AdminMembersPage
                key={`${institution.id}-${page}`}
                institutionId={institution.id}
                institutionName={institution.name}
                role={page === 'teachers' ? 'TEACHER' : 'STUDENT'}
                currentUserId={user.id}
              />
            )}
          </>
        );

      case 'institution':
        return (
          <AdminInstitutionPage
            institutionId={institution.id}
            onInstitutionRenamed={() => void loadSession()}
          />
        );

      case 'home':
      default:
        return (
          <>
            <WelcomePanel
              firstName={firstName}
              onOpenAppearance={() => navigate({ page: 'appearance' })}
            />
            {viewRole === 'ADMIN' ? (
              <AdminHomePage
                institutionId={institution.id}
                institutionName={institution.name}
                onOpenRequests={() => navigate({ page: 'users' })}
                onManageInstitutions={isPlatformAdmin ? () => navigate({ page: 'platform' }) : undefined}
              />
            ) : viewRole === 'TEACHER' ? (
              <TeacherHomePage
                institutionId={institution.id}
                institutionName={institution.name}
                navigate={navigate}
              />
            ) : (
              <StudentHomePage
                institutionId={institution.id}
                institutionName={institution.name}
                navigate={navigate}
              />
            )}
          </>
        );
    }
  }

  return (
    <AppShell
      activePage={page}
      onNavigate={next => navigate({ page: next })}
      githubLogin={user.github.login}
      avatarUrl={user.github.avatarUrl}
      institutionName={institution.name}
      institutionLogoUrl={institution.logoUrl}
      institutionAccent={institution.accentColor}
      institutions={user.institutions}
      activeInstitutionId={institution.id}
      onSwitchInstitution={switchInstitution}
      roles={institution.roles}
      viewRole={viewRole}
      onSwitchRole={switchRole}
      isPlatformAdmin={isPlatformAdmin}
      loggingOut={loggingOut}
      onLogout={logout}
    >
      {renderPage()}
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
