/*
 * Secciones de la aplicación y lógica de navegación sin DOM:
 * búsqueda de secciones, breadcrumbs y título de la pestaña.
 * Se prueba en tests/unit/navigation.test.ts.
 *
 * Hoy la sección activa vive en el estado de React y no cambia la URL.
 * Cuando Jero agregue la regla de rutas en vercel.json, cada sección
 * tendrá su dirección (/usuarios, /apariencia…) a partir de `path`.
 */

export type AdminPage =
  | 'home'
  | 'users'
  | 'teachers'
  | 'students'
  | 'institution'
  | 'profile'
  | 'appearance'
  | 'components';

export type SectionGroup = 'admin' | 'settings';

export type Section = {
  id: AdminPage;
  label: string;
  group: SectionGroup;
  /* Ruta prevista para cuando existan direcciones limpias. */
  path: string;
  /* Palabras extra para el buscador: "tema", "solicitudes"… */
  keywords: string[];
  devOnly?: boolean;
};

export const GROUP_LABELS: Record<SectionGroup, string> = {
  admin: 'Administración',
  settings: 'Ajustes',
};

export const SECTIONS: Section[] = [
  { id: 'home', label: 'Inicio', group: 'admin', path: '/', keywords: ['panel', 'resumen', 'dashboard'] },
  { id: 'users', label: 'Usuarios', group: 'admin', path: '/usuarios', keywords: ['solicitudes', 'acceso', 'aprobar', 'denegar', 'pendientes'] },
  { id: 'teachers', label: 'Profesores', group: 'admin', path: '/profesores', keywords: ['docentes', 'miembros'] },
  { id: 'students', label: 'Estudiantes', group: 'admin', path: '/estudiantes', keywords: ['alumnos', 'miembros'] },
  { id: 'institution', label: 'Institución', group: 'admin', path: '/institucion', keywords: ['universidad', 'dominios', 'configuración'] },
  { id: 'profile', label: 'Mi perfil', group: 'settings', path: '/perfil', keywords: ['cuenta', 'github', 'rol', 'identidad', 'usuario', 'codigo'] },
  { id: 'appearance', label: 'Apariencia', group: 'settings', path: '/apariencia', keywords: ['tema', 'color', 'oscuro', 'claro', 'gris', 'secundario', 'modo'] },
  { id: 'components', label: 'Componentes (dev)', group: 'settings', path: '/componentes', keywords: ['catálogo', 'botones', 'ui'], devOnly: true },
];

export function visibleSections(isDev: boolean): Section[] {
  return SECTIONS.filter(section => isDev || !section.devOnly);
}

export function findSection(id: AdminPage): Section {
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

export type Crumb = { label: string; page?: AdminPage };

/*
 * Ruta para los breadcrumbs: Institución › Grupo › Sección.
 * En Inicio basta con Institución › Inicio. El último elemento es la
 * página actual y no lleva destino.
 */
export function breadcrumbsFor(page: AdminPage, institutionName: string): Crumb[] {
  const section = findSection(page);
  if (section.id === 'home') {
    return [{ label: institutionName }, { label: section.label }];
  }
  return [
    { label: institutionName, page: 'home' },
    { label: GROUP_LABELS[section.group] },
    { label: section.label },
  ];
}

export function pageTitle(page: AdminPage, appName = 'WebClass'): string {
  return `${findSection(page).label} · ${appName}`;
}

export function primaryRoleLabel(roles: readonly string[]): string {
  if (roles.includes('ADMIN')) return 'Administrador';
  if (roles.includes('TEACHER')) return 'Profesor';
  if (roles.includes('STUDENT')) return 'Estudiante';
  return 'Sin rol';
}
