import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

export type ViewRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

export type AppPage =
  | 'home'
  | 'users'
  | 'teachers'
  | 'students'
  | 'institution'
  | 'courses'
  | 'profile'
  | 'requests'
  | 'platform';

/** Kept for existing imports; admin pages are a subset of AppPage. */
export type AdminPage = AppPage;

type AppShellProps = {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  githubLogin: string;
  avatarUrl: string | null;
  institutionName: string;
  institutionLogoUrl?: string | null;
  institutionAccent?: string | null;
  institutions: Array<{ id: string; name: string }>;
  activeInstitutionId: string;
  onSwitchInstitution: (institutionId: string) => void;
  roles: string[];
  viewRole: ViewRole;
  onSwitchRole: (role: ViewRole) => void;
  isPlatformAdmin: boolean;
  loggingOut: boolean;
  onLogout: () => void;
  children: ReactNode;
};

type NavItem = {
  id: AppPage;
  label: string;
  icon: ReactNode;
};

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 10.8 12 3l9 7.8v9.1a1.1 1.1 0 0 1-1.1 1.1H15v-6H9v6H4.1A1.1 1.1 0 0 1 3 19.9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TeacherIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m3 8 9-5 9 5-9 5-9-5Zm4 2.2V15c0 1.7 2.2 3 5 3s5-1.3 5-3v-4.8M21 8v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StudentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 8h5M19.5 5.5v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InstitutionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 21h18M5 21V9h14v12M3 9l9-6 9 6M9 13h2M13 13h2M9 17h2M13 17h2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5v-15ZM4 19.5A1.5 1.5 0 0 0 5.5 21H20M8 7h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6l2-8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

const NAV_BY_ROLE: Record<ViewRole, NavItem[]> = {
  ADMIN: [
    { id: 'home', label: 'Inicio', icon: <HomeIcon /> },
    { id: 'users', label: 'Solicitudes', icon: <UsersIcon /> },
    { id: 'teachers', label: 'Profesores', icon: <TeacherIcon /> },
    { id: 'students', label: 'Estudiantes', icon: <StudentIcon /> },
    {
      id: 'institution',
      label: 'Institución',
      icon: <InstitutionIcon />,
    },
  ],
  TEACHER: [
    { id: 'home', label: 'Inicio', icon: <HomeIcon /> },
    { id: 'courses', label: 'Cursos', icon: <BookIcon /> },
  ],
  STUDENT: [
    { id: 'home', label: 'Inicio', icon: <HomeIcon /> },
    { id: 'courses', label: 'Cursos', icon: <BookIcon /> },
  ],
};

const COMMON_NAV: NavItem[] = [
  { id: 'profile', label: 'Perfil', icon: <ProfileIcon /> },
  { id: 'requests', label: 'Mis solicitudes', icon: <InboxIcon /> },
];

const ROLE_NAME: Record<ViewRole, string> = {
  ADMIN: 'Administrador',
  TEACHER: 'Profesor',
  STUDENT: 'Estudiante',
};

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  const stored = window.localStorage.getItem('vmat-theme');

  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return window.matchMedia(
    '(prefers-color-scheme: dark)',
  ).matches
    ? 'dark'
    : 'light';
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppShell({
  activePage,
  onNavigate,
  githubLogin,
  avatarUrl,
  institutionName,
  institutionLogoUrl,
  institutionAccent,
  institutions,
  activeInstitutionId,
  onSwitchInstitution,
  roles,
  viewRole,
  onSwitchRole,
  isPlatformAdmin,
  loggingOut,
  onLogout,
  children,
}: AppShellProps) {
  const navItems = [
    ...NAV_BY_ROLE[viewRole],
    ...COMMON_NAV,
    ...(isPlatformAdmin
      ? [{ id: 'platform' as const, label: 'Plataforma', icon: <GlobeIcon /> }]
      : []),
  ];
  const switchableRoles = (['ADMIN', 'TEACHER', 'STUDENT'] as const).filter(
    role => roles.includes(role),
  );
  const [theme, setTheme] = useState<Theme>(
    getInitialTheme,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('vmat-theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(current =>
      current === 'light' ? 'dark' : 'light',
    );
  }

  const primaryRole = ROLE_NAME[viewRole];

  return (
    <div
      className="vmat-shell"
      style={
        institutionAccent
          ? ({
              '--vmat-institution-accent': institutionAccent,
            } as CSSProperties)
          : undefined
      }
    >
      <aside className="vmat-sidebar">
        <div className="vmat-brand">
          {institutionLogoUrl ? (
            <img
              className="vmat-logo institution-logo"
              src={institutionLogoUrl}
              alt=""
            />
          ) : (
            <div className="vmat-logo">V</div>
          )}

          <div>
            <strong>VMAT</strong>
            <span>Classroom</span>
          </div>
        </div>

        {switchableRoles.length > 1 && (
          <div className="role-switch" role="group" aria-label="Ver como">
            {switchableRoles.map(role => (
              <button
                key={role}
                type="button"
                className={role === viewRole ? 'active' : ''}
                aria-pressed={role === viewRole}
                onClick={() => onSwitchRole(role)}
              >
                {ROLE_NAME[role]}
              </button>
            ))}
          </div>
        )}

        <nav className="vmat-nav" aria-label="Navegación principal">
          {navItems.map(item => (
            <button
              key={item.id}
              type="button"
              className={
                activePage === item.id
                  ? 'vmat-nav-item active'
                  : 'vmat-nav-item'
              }
              onClick={() => onNavigate(item.id)}
            >
              <span className="vmat-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="vmat-sidebar-bottom">
          <div className="sidebar-institution">
            <span>INSTITUCIÓN</span>
            {institutions.length > 1 ? (
              <>
                <label
                  htmlFor="active-institution"
                  className="visually-hidden"
                >
                  Institución activa
                </label>
                <select
                  id="active-institution"
                  className="institution-select"
                  value={activeInstitutionId}
                  onChange={event =>
                    onSwitchInstitution(event.target.value)
                  }
                >
                  {institutions.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <strong>{institutionName}</strong>
            )}
          </div>

          <div className="sidebar-user">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" />
            ) : (
              <div className="sidebar-avatar">
                {githubLogin.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="sidebar-user-copy">
              <strong>{githubLogin}</strong>
              <span>{primaryRole}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="vmat-workspace">
        <header className="vmat-topbar">
          <div className="topbar-context">
            <span>VMAT</span>
            <strong>{institutionName}</strong>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={
                theme === 'light'
                  ? 'Activar modo oscuro'
                  : 'Activar modo claro'
              }
              title={
                theme === 'light'
                  ? 'Modo oscuro'
                  : 'Modo claro'
              }
            >
              <ThemeIcon theme={theme} />
            </button>

            <div className="topbar-role">
              <span className="role-dot" />
              {primaryRole}
            </div>

            <div className="topbar-profile">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" />
              ) : (
                <div className="topbar-avatar">
                  {githubLogin.charAt(0).toUpperCase()}
                </div>
              )}

              <div>
                <strong>{githubLogin}</strong>
                <span>GitHub conectado</span>
              </div>
            </div>

            <button
              type="button"
              className="topbar-logout"
              onClick={onLogout}
              disabled={loggingOut}
            >
              {loggingOut ? 'Cerrando…' : 'Salir'}
            </button>
          </div>
        </header>

        <main className="vmat-content">{children}</main>
      </div>
    </div>
  );
}
