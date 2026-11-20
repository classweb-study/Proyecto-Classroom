import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  GridIcon,
  HalfCircleIcon,
  HomeIcon,
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
  GROUP_LABELS,
  breadcrumbsFor,
  pageTitle,
  primaryRoleLabel,
  visibleSections,
  type AdminPage,
  type Section,
  type SectionGroup,
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

export type { AdminPage } from '../navigation/sections';

type AppShellProps = {
  activePage: AdminPage;
  onNavigate: (page: AdminPage) => void;
  githubLogin: string;
  avatarUrl: string | null;
  institutionName: string;
  /*
   * Selector de institución activa, para quien pertenece a varias.
   * Mismos nombres que usa main.tsx en la rama feat/maura-admin-institution.
   * Son opcionales: sin ellos se muestra solo el nombre.
   */
  institutions?: Array<{ id: string; name: string }>;
  activeInstitutionId?: string;
  onSwitchInstitution?: (institutionId: string) => void;
  roles: string[];
  loggingOut: boolean;
  onLogout: () => void;
  children: ReactNode;
};

const ICONS: Record<AdminPage, ReactNode> = {
  home: <HomeIcon />,
  users: <UsersIcon />,
  teachers: <TeacherIcon />,
  students: <StudentIcon />,
  institution: <InstitutionIcon />,
  profile: <UserIcon />,
  appearance: <PaletteIcon />,
  components: <GridIcon />,
};

// El catálogo solo existe con `npm run dev:web`; el build lo elimina.
const SECTIONS = visibleSections(import.meta.env.DEV);
const GROUPS: SectionGroup[] = ['admin', 'settings'];

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
  onNavigate: (page: AdminPage) => void;
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
  onNavigate,
}: {
  page: AdminPage;
  institutionName: string;
  onNavigate: (page: AdminPage) => void;
}) {
  const crumbs = breadcrumbsFor(page, institutionName);

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

export function AppShell({
  activePage,
  onNavigate,
  githubLogin,
  avatarUrl,
  institutionName,
  institutions = [],
  activeInstitutionId,
  onSwitchInstitution,
  roles,
  loggingOut,
  onLogout,
  children,
}: AppShellProps) {
  const canSwitchInstitution =
    institutions.length > 1 && activeInstitutionId !== undefined && onSwitchInstitution !== undefined;
  const { theme } = useAppearance();
  const upcomingTheme = nextTheme(theme);
  const themeButtonLabel = `Cambiar a base ${THEME_ADJECTIVES[upcomingTheme]}`;
  const roleLabel = primaryRoleLabel(roles);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Última sección mostrada: el foco solo se mueve si la sección cambia de verdad.
  const shownPage = useRef(activePage);

  function navigate(page: AdminPage) {
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
    <div className="vmat-shell" data-menu-open={menuOpen || undefined}>
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>

      <aside id="menu-principal" className="vmat-sidebar" aria-label="Menú principal">
        <div className="vmat-brand">
          <div className="vmat-logo" aria-hidden="true">
            W
          </div>
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

        <SectionSearch ref={searchRef} sections={SECTIONS} onNavigate={navigate} />

        <nav className="vmat-nav" aria-label="Secciones">
          {GROUPS.map(group => {
            const items = SECTIONS.filter(section => section.group === group);
            return (
              <div key={group} className="vmat-nav-section">
                <h2 className="vmat-nav-group" id={`grupo-${group}`}>
                  {GROUP_LABELS[group]}
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

          <Breadcrumbs page={activePage} institutionName={institutionName} onNavigate={navigate} />

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
