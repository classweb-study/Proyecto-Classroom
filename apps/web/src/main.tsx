import {
  StrictMode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';

import {
  AppShell,
  type AppPage,
  type ViewRole,
} from './components/AppShell';
import { AdminHomePage } from './pages/AdminHomePage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminMembersPage } from './pages/AdminMembersPage';
import { AccessRequestsPage } from './pages/AccessRequestsPage';
import { AdminInstitutionPage } from './pages/AdminInstitutionPage';
import { CoursesSection } from './pages/CoursesPage';
import { StudentHomePage, TeacherHomePage } from './pages/HomeDashboards';
import { PlatformPage } from './pages/PlatformPage';
import { ProfilePage } from './pages/ProfilePage';
import type { Navigate } from './lib/api';

import './style.css';

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
  | { status: 'error' };

type View = {
  page: AppPage;
  courseId?: string;
  activityId?: string;
};

const ROLE_PRIORITY: ViewRole[] = ['ADMIN', 'TEACHER', 'STUDENT'];

const PAGES_BY_ROLE: Record<ViewRole, AppPage[]> = {
  ADMIN: ['home', 'users', 'teachers', 'students', 'institution'],
  TEACHER: ['home', 'courses'],
  STUDENT: ['home', 'courses'],
};

const COMMON_PAGES: AppPage[] = ['profile', 'requests', 'platform'];

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.2c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"
      />
    </svg>
  );
}

function App() {
  const [auth, setAuth] = useState<AuthState>({
    status: 'loading',
  });

  const [loggingOut, setLoggingOut] = useState(false);
  const [view, setView] = useState<View>({ page: 'home' });
  const [activeInstitutionId, setActiveInstitutionId] =
    useState<string | null>(() => readStored(ACTIVE_INSTITUTION_KEY));
  const [preferredRole, setPreferredRole] = useState<string | null>(() =>
    readStored(VIEW_ROLE_KEY),
  );
  const [platformOnly, setPlatformOnly] = useState(false);

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

  const loadSession = useCallback((signal?: AbortSignal) => {
    return fetch('/me', {
      credentials: 'same-origin',
      signal,
    })
      .then(async response => {
        if (response.status === 401) {
          setAuth({ status: 'anonymous' });
          return;
        }

        if (!response.ok) {
          throw new Error('Unable to load session');
        }

        const body = (await response.json()) as {
          user: CurrentUser;
        };

        setAuth({
          status: 'authenticated',
          user: body.user,
        });
      })
      .catch(error => {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        setAuth({ status: 'error' });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
    return () => controller.abort();
  }, [loadSession]);

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

      setAuth({ status: 'anonymous' });
    } catch {
      setAuth({ status: 'error' });
    } finally {
      setLoggingOut(false);
    }
  }

  if (auth.status === 'loading') {
    return (
      <main className="center-screen">
        <div>
          <div className="loader" />
          <p className="muted">Cargando WebClass…</p>
        </div>
      </main>
    );
  }

  if (auth.status === 'anonymous') {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">W</div>

          <p className="eyebrow">WebClass</p>

          <h1>Tu aula, conectada con GitHub.</h1>

          <p className="auth-description">
            Gestiona cursos, entregas y repositorios desde un
            solo lugar.
          </p>

          <a
            className="github-button"
            href="/auth/github"
          >
            <GitHubIcon />
            Continuar con GitHub
          </a>

          <p className="auth-note">
            GitHub autentica tu cuenta. Los permisos académicos
            se gestionan de forma independiente en WebClass.
          </p>
        </section>
      </main>
    );
  }

  if (auth.status === 'error') {
    return (
      <main className="center-screen">
        <div className="error-card">
          <p className="eyebrow">WebClass</p>
          <h1>No pudimos cargar tu sesión.</h1>

          <p className="muted">
            Comprueba que la API esté ejecutándose e inténtalo
            nuevamente.
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      </main>
    );
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
  const page: AppPage =
    PAGES_BY_ROLE[viewRole].includes(view.page) ||
    (COMMON_PAGES.includes(view.page) &&
      (view.page !== 'platform' || isPlatformAdmin))
      ? view.page
      : 'home';

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

      case 'platform':
        return <PlatformPage onChanged={() => void loadSession()} />;

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
            currentUserId={user.id}
          />
        );

      case 'students':
        return (
          <AdminMembersPage
            institutionId={institution.id}
            institutionName={institution.name}
            role="STUDENT"
            currentUserId={user.id}
          />
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
        if (viewRole === 'ADMIN') {
          return (
            <AdminHomePage
              institutionId={institution.id}
              institutionName={institution.name}
              onOpenRequests={() => navigate({ page: 'users' })}
            />
          );
        }

        return viewRole === 'TEACHER' ? (
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

createRoot(
  document.getElementById('root')!,
).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
