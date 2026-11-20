import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import {
  BookIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  GlobeIcon,
  GridIcon,
  HalfCircleIcon,
  HomeIcon,
  InboxIcon,
  InstitutionIcon,
  MenuIcon,
  MoonIcon,
  PaletteIcon,
  StudentIcon,
  SunIcon,
  TeacherIcon,
  UserIcon,
  UsersIcon,
} from './icons';
import { ProfileMenu } from './ProfileMenu';
import { SectionSearch } from './SectionSearch';

import {
  ROLE_NAME,
  breadcrumbsFor,
  groupLabel,
  pageTitle,
  sectionsFor,
  type AppPage,
  type Section,
  type SectionGroup,
  type ViewRole,
} from '../navigation/sections';
import {
  THEME_ADJECTIVES,
  nextTheme,
  type Theme,
} from '../theme/appearance';
import {
  setAppearance,
  useAppearance,
} from '../theme/appearance-store';

export type { AdminPage, AppPage, ViewRole } from '../navigation/sections';

type AppShellProps = {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  githubLogin: string;
  avatarUrl: string | null;
  institutionName: string;
  /* Logo y color propios de la institución, si los configuró. */
  institutionLogoUrl?: string | null;
  institutionAccent?: string | null;
  /* Selector de institución activa, para quien pertenece a varias. */
  institutions?: Array<{ id: string; name: string }>;
  activeInstitutionId?: string;
  onSwitchInstitution?: (institutionId: string) => void;
  roles: string[];
  /* Rol con el que se está viendo la app y cambio entre roles. */
  viewRole?: ViewRole;
  onSwitchRole?: (role: ViewRole) => void;
  isPlatformAdmin?: boolean;
  loggingOut: boolean;
  onLogout: () => void;
  children: ReactNode;
};

const ICONS: Record<AppPage, ReactNode> = {
  home: <HomeIcon />,
  users: <UsersIcon />,
  teachers: <TeacherIcon />,
  students: <StudentIcon />,
  institution: <InstitutionIcon />,
  courses: <BookIcon />,
  profile: <UserIcon />,
  requests: <InboxIcon />,
  appearance: <PaletteIcon />,
  platform: <GlobeIcon />,
  components: <GridIcon />,
};

const GROUPS: SectionGroup[] = ['main', 'account'];
const ROLE_ORDER: ViewRole[] = ['ADMIN', 'TEACHER', 'STUDENT'];

/* Muestra la base a la que se va a cambiar, no la actual. */
function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'light') return <SunIcon />;
  if (theme === 'dark') return <MoonIcon />;
  return <HalfCircleIcon />;
}

function NavButton({
  section,
  active,
  onNavigate,
}: {
  section: Section;
  active: boolean;
  onNavigate: (page: AppPage) => void;
}) {
  return (
    <button
      type="button"
      className={active ? 'vmat-nav-item active' : 'vmat-nav-item'}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate(section.id)}
    >
      <span className="vmat-nav-icon">{ICONS[section.id]}</span>
      <span>{section.label}</span>
    </button>
  );
}

function Breadcrumbs({
  page,
  institutionName,
  role,
  onNavigate,
}: {
  page: AppPage;
  institutionName: string;
  role: ViewRole;
  onNavigate: (page: AppPage) => void;
}) {
  const crumbs = breadcrumbsFor(page, institutionName, role);

  return (
    <nav className="breadcrumbs" aria-label="Ruta de navegación">
      <ol>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              {crumb.page && !last ? (
                <button type="button" title={crumb.label} onClick={() => onNavigate(crumb.page!)}>
                  {crumb.label}
                </button>
              ) : (
                <span aria-current={last ? 'page' : undefined} title={crumb.label}>
                  {crumb.label}
                </span>
              )}
              {!last && <ChevronRightIcon className="breadcrumbs-separator" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* Rol por defecto si main.tsx no indica uno: el de más permisos. */
function defaultRole(roles: readonly string[]): ViewRole {
  return ROLE_ORDER.find(role => roles.includes(role)) ?? 'STUDENT';
}

export function AppShell({
  activePage,
  onNavigate,
  githubLogin,
  avatarUrl,
  institutionName,
  institutionLogoUrl,
  institutionAccent,
  institutions = [],
  activeInstitutionId,
  onSwitchInstitution,
  roles,
  viewRole,
  onSwitchRole,
  isPlatformAdmin = false,
  loggingOut,
  onLogout,
  children,
}: AppShellProps) {
  const role = viewRole ?? defaultRole(roles);
  // El catálogo solo existe con `npm run dev:web`; el build lo elimina.
  const sections = sectionsFor({ isDev: import.meta.env.DEV, role, isPlatformAdmin });
  const switchableRoles = ROLE_ORDER.filter(item => roles.includes(item));
  const canSwitchRole = switchableRoles.length > 1 && onSwitchRole !== undefined;
  const canSwitchInstitution =
    institutions.length > 1 && activeInstitutionId !== undefined && onSwitchInstitution !== undefined;

  const { theme } = useAppearance();
  const upcomingTheme = nextTheme(theme);
  const themeButtonLabel = `Cambiar a base ${THEME_ADJECTIVES[upcomingTheme]}`;
  const roleLabel = ROLE_NAME[role];

  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Última sección mostrada: el foco solo se mueve si la sección cambia de verdad.
  const shownPage = useRef(activePage);

  function navigate(page: AppPage) {
    setMenuOpen(false);
    onNavigate(page);
  }

  function closeMenu() {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  // Título de la pestaña y foco en el contenido al cambiar de sección,
  // para que el lector de pantalla anuncie la página nueva.
  useEffect(() => {
    document.title = pageTitle(activePage);
    if (shownPage.current === activePage) return;
    shownPage.current = activePage;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [activePage]);

  // Menú móvil abierto: foco adentro, Escape lo cierra y la página no se desplaza.
  useEffect(() => {
    if (!menuOpen) return;

    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMenu();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Atajo "/" para ir al buscador, salvo cuando se está escribiendo.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      // En escritorio el buscador ya está visible: foco inmediato, para no
      // perder la primera letra si la persona escribe rápido.
      if (window.matchMedia('(max-width: 760px)').matches) {
        setMenuOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      } else {
        searchRef.current?.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="vmat-shell"
      data-menu-open={menuOpen || undefined}
      style={
        institutionAccent
          ? ({ '--vmat-institution-accent': institutionAccent } as CSSProperties)
          : undefined
      }
    >
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>

      <aside id="menu-principal" className="vmat-sidebar" aria-label="Menú principal">
        <div className="vmat-brand">
          {institutionLogoUrl ? (
            <img className="vmat-logo institution-logo" src={institutionLogoUrl} alt="" />
          ) : (
            <div className="vmat-logo" aria-hidden="true">
              W
            </div>
          )}
          <div className="vmat-brand-text">
            <strong>WebClass</strong>
            <span>Classroom</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="vmat-menu-close"
            aria-label="Cerrar menú"
            onClick={closeMenu}
          >
            <CloseIcon />
          </button>
        </div>

        {canSwitchRole && (
          <div className="role-switch" role="group" aria-label="Ver como">
            {switchableRoles.map(item => (
              <button
                key={item}
                type="button"
                className={item === role ? 'active' : ''}
                aria-pressed={item === role}
                onClick={() => {
                  setMenuOpen(false);
                  onSwitchRole(item);
                }}
              >
                {ROLE_NAME[item]}
              </button>
            ))}
          </div>
        )}

        <SectionSearch ref={searchRef} sections={sections} role={role} onNavigate={navigate} />

        <nav className="vmat-nav" aria-label="Secciones">
          {GROUPS.map(group => {
            const items = sections.filter(section => section.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="vmat-nav-section">
                <h2 className="vmat-nav-group" id={`grupo-${group}`}>
                  {groupLabel(group, role)}
                </h2>
                <ul aria-labelledby={`grupo-${group}`}>
                  {items.map(section => (
                    <li key={section.id}>
                      <NavButton
                        section={section}
                        active={activePage === section.id}
                        onNavigate={navigate}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="vmat-sidebar-bottom">
          <div className="sidebar-institution">
            {canSwitchInstitution ? (
              <>
                <label htmlFor="institucion-activa">Institución</label>
                <span className="institution-switch">
                  <select
                    id="institucion-activa"
                    className="institution-select"
                    value={activeInstitutionId}
                    onChange={event => onSwitchInstitution(event.target.value)}
                  >
                    {institutions.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon />
                </span>
              </>
            ) : (
              <>
                <span>Institución</span>
                <strong title={institutionName}>{institutionName}</strong>
              </>
            )}
          </div>
        </div>
      </aside>

      <div className="vmat-scrim" aria-hidden="true" onClick={closeMenu} />

      <div className="vmat-workspace">
        <header className="vmat-topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="vmat-menu-toggle"
            aria-label="Abrir menú"
            aria-controls="menu-principal"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <MenuIcon />
          </button>

          <Breadcrumbs page={activePage} institutionName={institutionName} role={role} onNavigate={navigate} />

          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setAppearance({ theme: upcomingTheme })}
              aria-label={themeButtonLabel}
              title={themeButtonLabel}
            >
              <ThemeIcon theme={upcomingTheme} />
            </button>

            <ProfileMenu
              githubLogin={githubLogin}
              avatarUrl={avatarUrl}
              roleLabel={roleLabel}
              institutionName={institutionName}
              loggingOut={loggingOut}
              onOpenProfile={() => navigate('profile')}
              onOpenAppearance={() => navigate('appearance')}
              onLogout={onLogout}
            />
          </div>
        </header>

        <main id="contenido-principal" className="vmat-content" ref={mainRef} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
