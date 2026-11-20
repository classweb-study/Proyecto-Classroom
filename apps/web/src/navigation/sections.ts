/*
 * Secciones de la aplicación y lógica de navegación sin DOM:
 * qué ve cada rol, búsqueda de secciones, breadcrumbs y título de la pestaña.
 * Se prueba en tests/unit/navigation.test.ts.
 *
 * Hoy la sección activa vive en el estado de React y no cambia la URL.
 * Cuando haya reglas de rutas en vercel.json, cada sección tendrá su
 * dirección (/cursos, /apariencia…) a partir de `path`.
 */

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
  | 'appearance'
  | 'platform'
  | 'components';

/** Se mantiene para los imports existentes. */
export type AdminPage = AppPage;

export type SectionGroup = 'main' | 'account';

export type Section = {
  id: AppPage;
  label: string;
  group: SectionGroup;
  /* Ruta prevista para cuando existan direcciones limpias. */
  path: string;
  /* Palabras extra para el buscador: "tema", "solicitudes"… */
  keywords: string[];
  /* Roles que ven la sección. Sin valor: todos. */
  roles?: ViewRole[];
  platformAdminOnly?: boolean;
  devOnly?: boolean;
};

const MAIN_GROUP_LABEL: Record<ViewRole, string> = {
  ADMIN: 'Administración',
  TEACHER: 'Docencia',
  STUDENT: 'Aula',
};

export function groupLabel(group: SectionGroup, role: ViewRole = 'ADMIN'): string {
  return group === 'main' ? MAIN_GROUP_LABEL[role] : 'Tu cuenta';
}

const ADMIN: ViewRole[] = ['ADMIN'];
const CLASSROOM: ViewRole[] = ['TEACHER', 'STUDENT'];

export const SECTIONS: Section[] = [
  { id: 'home', label: 'Inicio', group: 'main', path: '/', keywords: ['panel', 'resumen', 'dashboard'] },
  { id: 'users', label: 'Solicitudes', group: 'main', path: '/solicitudes', keywords: ['usuarios', 'acceso', 'aprobar', 'denegar', 'pendientes'], roles: ADMIN },
  { id: 'teachers', label: 'Profesores', group: 'main', path: '/profesores', keywords: ['docentes', 'miembros'], roles: ADMIN },
  { id: 'students', label: 'Estudiantes', group: 'main', path: '/estudiantes', keywords: ['alumnos', 'miembros'], roles: ADMIN },
  { id: 'institution', label: 'Institución', group: 'main', path: '/institucion', keywords: ['universidad', 'dominios', 'configuración', 'logo'], roles: ADMIN },
  { id: 'courses', label: 'Cursos', group: 'main', path: '/cursos', keywords: ['materias', 'clases', 'actividades', 'entregas', 'tareas'], roles: CLASSROOM },
  { id: 'profile', label: 'Mi perfil', group: 'account', path: '/perfil', keywords: ['cuenta', 'github', 'rol', 'identidad', 'usuario', 'notificaciones'] },
  { id: 'requests', label: 'Mis solicitudes', group: 'account', path: '/mis-solicitudes', keywords: ['acceso', 'unirme', 'pedir', 'mensajes'] },
  { id: 'appearance', label: 'Apariencia', group: 'account', path: '/apariencia', keywords: ['tema', 'color', 'oscuro', 'claro', 'gris', 'secundario', 'modo'] },
  { id: 'platform', label: 'Plataforma', group: 'account', path: '/plataforma', keywords: ['instituciones', 'registrar', 'global'], platformAdminOnly: true },
  { id: 'components', label: 'Componentes (dev)', group: 'account', path: '/componentes', keywords: ['catálogo', 'botones', 'ui'], devOnly: true },
];

export type SectionFilter = {
  isDev: boolean;
  role?: ViewRole;
  isPlatformAdmin?: boolean;
};

/*
 * Secciones que ve una persona. Sin `role` se devuelven las de todos los
 * roles (sirve para el buscador de pruebas y el catálogo).
 */
export function sectionsFor({ isDev, role, isPlatformAdmin = false }: SectionFilter): Section[] {
  return SECTIONS.filter(
    section =>
      (isDev || !section.devOnly) &&
      (isPlatformAdmin || !section.platformAdminOnly || role === undefined) &&
      (role === undefined || !section.roles || section.roles.includes(role)),
  );
}

export function visibleSections(isDev: boolean): Section[] {
  return sectionsFor({ isDev });
}

/* ¿Puede este rol abrir la sección? Si no, la app vuelve a Inicio. */
export function canOpen(page: AppPage, role: ViewRole, isPlatformAdmin: boolean, isDev: boolean): boolean {
  return sectionsFor({ isDev, role, isPlatformAdmin }).some(section => section.id === page);
}

export function findSection(id: AppPage): Section {
  return SECTIONS.find(section => section.id === id) ?? SECTIONS[0]!;
}

/* Minúsculas y sin tildes: "institucion" encuentra "Institución". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/*
 * Busca secciones por nombre y palabras clave.
 * Orden: primero las que empiezan por lo escrito, luego las que lo
 * contienen en el nombre y al final las que coinciden por palabra clave.
 */
export function searchSections(query: string, sections: Section[]): Section[] {
  const needle = normalizeText(query);
  if (!needle) return [];

  const scored = sections
    .map(section => {
      const label = normalizeText(section.label);
      const keywords = section.keywords.map(normalizeText);
      let score = 0;
      if (label.startsWith(needle)) score = 3;
      else if (label.includes(needle)) score = 2;
      else if (keywords.some(keyword => keyword.startsWith(needle) || keyword.includes(needle))) score = 1;
      return { section, score };
    })
    .filter(entry => entry.score > 0);

  // sort es estable: a igual puntaje se respeta el orden del menú.
  return scored.sort((a, b) => b.score - a.score).map(entry => entry.section);
}

export type Crumb = { label: string; page?: AppPage };

/*
 * Ruta para los breadcrumbs: Institución › Grupo › Sección.
 * En Inicio basta con Institución › Inicio. El último elemento es la
 * página actual y no lleva destino.
 */
export function breadcrumbsFor(page: AppPage, institutionName: string, role: ViewRole = 'ADMIN'): Crumb[] {
  const section = findSection(page);
  if (section.id === 'home') {
    return [{ label: institutionName }, { label: section.label }];
  }
  return [
    { label: institutionName, page: 'home' },
    { label: groupLabel(section.group, role) },
    { label: section.label },
  ];
}

export function pageTitle(page: AppPage, appName = 'WebClass'): string {
  return `${findSection(page).label} · ${appName}`;
}

export const ROLE_NAME: Record<ViewRole, string> = {
  ADMIN: 'Administrador',
  TEACHER: 'Profesor',
  STUDENT: 'Estudiante',
};

export function primaryRoleLabel(roles: readonly string[]): string {
  if (roles.includes('ADMIN')) return 'Administrador';
  if (roles.includes('TEACHER')) return 'Profesor';
  if (roles.includes('STUDENT')) return 'Estudiante';
  return 'Sin rol';
}
