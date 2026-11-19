import {
  StrictMode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';

import {
  AppShell,
  type AdminPage,
} from './components/AppShell';
import { AdminHomePage } from './pages/AdminHomePage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminMembersPage } from './pages/AdminMembersPage';
import { AccessRequestsPage } from './pages/AccessRequestsPage';
import { AdminInstitutionPage } from './pages/AdminInstitutionPage';

const ACTIVE_INSTITUTION_KEY = 'vmat-active-institution';

function readStoredInstitution(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_INSTITUTION_KEY);
  } catch {
    return null;
  }
}

function storeInstitution(institutionId: string) {
  try {
    window.localStorage.setItem(ACTIVE_INSTITUTION_KEY, institutionId);
  } catch {
    // Remembering the choice is a convenience; the switch still works without it.
  }
}

import './style.css';

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
  institutions: Array<{
    id: string;
    name: string;
    slug: string;
    roles: InstitutionRole[];
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
  const [activePage, setActivePage] =
    useState<AdminPage>('home');
  const [activeInstitutionId, setActiveInstitutionId] =
    useState<string | null>(readStoredInstitution);

  function switchInstitution(institutionId: string) {
    setActiveInstitutionId(institutionId);
    storeInstitution(institutionId);
    setActivePage('home');
  }

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
          <p className="muted">Cargando VMAT…</p>
        </div>
      </main>
    );
  }

  if (auth.status === 'anonymous') {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">V</div>

          <p className="eyebrow">VMAT CLASSROOM</p>

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
            se gestionan de forma independiente en VMAT.
          </p>
        </section>
      </main>
    );
  }

  if (auth.status === 'error') {
    return (
      <main className="center-screen">
        <div className="error-card">
          <p className="eyebrow">VMAT</p>
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
  const institution =
    user.institutions.find(
      item => item.id === activeInstitutionId,
    ) ?? user.institutions[0];

  const institutionSwitcher =
    user.institutions.length > 1 && institution ? (
      <select
        className="institution-select"
        aria-label="Institución activa"
        value={institution.id}
        onChange={event => switchInstitution(event.target.value)}
      >
        {user.institutions.map(item => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    ) : null;

  if (!institution) {
    return (
      <AccessRequestsPage
        githubLogin={user.github.login}
        loggingOut={loggingOut}
        onLogout={logout}
      />
    );
  }

  if (!institution.roles.includes('ADMIN')) {
    return (
      <main className="center-screen">
        <div className="error-card">
          <p className="eyebrow">VMAT</p>
          <h1>Perfil académico registrado</h1>

          <p className="muted">
            Esta cuenta pertenece a {institution.name}, pero la
            interfaz para su rol todavía no está habilitada en
            esta etapa del desarrollo.
          </p>

          {institutionSwitcher}

          <button
            type="button"
            className="logout-button"
            onClick={logout}
            disabled={loggingOut}
          >
            {loggingOut
              ? 'Cerrando sesión…'
              : 'Cerrar sesión'}
          </button>
        </div>
      </main>
    );
  }

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
        return (
          <AdminHomePage
            institutionId={institution.id}
            institutionName={institution.name}
            onOpenRequests={() => setActivePage('users')}
          />
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
      institutions={user.institutions}
      activeInstitutionId={institution.id}
      onSwitchInstitution={switchInstitution}
      roles={institution.roles}
      loggingOut={loggingOut}
      onLogout={logout}
    >
      {renderAdminPage()}
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
