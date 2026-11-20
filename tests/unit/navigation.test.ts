import { describe, expect, it } from 'vitest';

import {
  SECTIONS,
  breadcrumbsFor,
  findSection,
  normalizeText,
  pageTitle,
  primaryRoleLabel,
  canOpen,
  searchSections,
  sectionsFor,
  visibleSections,
} from '../../apps/web/src/navigation/sections.js';

const prod = visibleSections(false);
const dev = visibleSections(true);
const admin = sectionsFor({ isDev: false, role: 'ADMIN' });
const student = sectionsFor({ isDev: false, role: 'STUDENT' });
const ids = (list: { id: string }[]) => list.map(section => section.id);

describe('secciones visibles', () => {
  it('el catálogo de componentes solo aparece en desarrollo', () => {
    expect(ids(prod)).not.toContain('components');
    expect(ids(dev)).toContain('components');
  });

  it('cada sección tiene una ruta prevista única para cuando haya direcciones limpias', () => {
    const paths = SECTIONS.map(section => section.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path).toMatch(/^\/[a-z-]*$/);
  });
});

describe('normalizeText', () => {
  it('quita tildes, mayúsculas y espacios de los extremos', () => {
    expect(normalizeText('  Institución ')).toBe('institucion');
    expect(normalizeText('ÁRBOL')).toBe('arbol');
  });
});

describe('searchSections', () => {
  it('encuentra sin tildes ni mayúsculas', () => {
    expect(ids(searchSections('institucion', admin))).toEqual(['institution']);
    // Mi perfil aparece por la palabra clave "usuario"; Solicitudes por "usuarios".
    expect(ids(searchSections('USU', admin))).toEqual(['users', 'profile']);
  });

  it('busca también por palabras clave', () => {
    expect(ids(searchSections('cuenta', admin))).toEqual(['profile']);
    expect(ids(searchSections('tema', admin))).toEqual(['appearance']);
    expect(ids(searchSections('solicitudes', admin))).toEqual(['users', 'requests']);
    expect(ids(searchSections('docentes', admin))).toEqual(['teachers']);
    expect(ids(searchSections('entregas', student))).toEqual(['courses']);
  });

  it('pone primero lo que empieza igual, después lo que lo contiene y al final las palabras clave', () => {
    // "es": Estudiantes empieza por "es"; Solicitudes y Profesores lo contienen, en el orden del menú.
    expect(ids(searchSections('es', admin)).slice(0, 3)).toEqual(['students', 'users', 'teachers']);
  });

  it('no devuelve nada para una búsqueda vacía o sin coincidencias', () => {
    expect(searchSections('   ', prod)).toEqual([]);
    expect(searchSections('xyz', prod)).toEqual([]);
  });

  it('en producción no encuentra el catálogo', () => {
    expect(ids(searchSections('catalogo', prod))).toEqual([]);
    expect(ids(searchSections('catalogo', dev))).toEqual(['components']);
  });
});

describe('breadcrumbsFor', () => {
  it('en Inicio muestra institución y página, sin enlaces', () => {
    expect(breadcrumbsFor('home', 'Universidad X')).toEqual([
      { label: 'Universidad X' },
      { label: 'Inicio' },
    ]);
  });

  it('en una sección enlaza la institución al inicio y termina en la página actual', () => {
    expect(breadcrumbsFor('users', 'Universidad X')).toEqual([
      { label: 'Universidad X', page: 'home' },
      { label: 'Administración' },
      { label: 'Solicitudes' },
    ]);
    expect(breadcrumbsFor('appearance', 'Universidad X')[1]).toEqual({ label: 'Tu cuenta' });
    expect(breadcrumbsFor('courses', 'Universidad X', 'TEACHER')[1]).toEqual({ label: 'Docencia' });
    expect(breadcrumbsFor('courses', 'Universidad X', 'STUDENT')[1]).toEqual({ label: 'Aula' });
  });
});

describe('secciones por rol', () => {
  const visible = (role: 'ADMIN' | 'TEACHER' | 'STUDENT', platform = false) =>
    ids(sectionsFor({ isDev: false, role, isPlatformAdmin: platform }));

  it('la administración solo la ve el administrador y Cursos solo profesor y estudiante', () => {
    expect(visible('ADMIN')).toEqual(['home', 'users', 'teachers', 'students', 'institution', 'profile', 'requests', 'appearance']);
    expect(visible('TEACHER')).toEqual(['home', 'courses', 'profile', 'requests', 'appearance']);
    expect(visible('STUDENT')).toEqual(visible('TEACHER'));
  });

  it('Plataforma solo para quien administra la plataforma', () => {
    expect(visible('STUDENT')).not.toContain('platform');
    expect(visible('STUDENT', true)).toContain('platform');
  });

  it('una sección de otro rol no se puede abrir (la app vuelve a Inicio)', () => {
    expect(canOpen('courses', 'ADMIN', false, false)).toBe(false);
    expect(canOpen('users', 'STUDENT', false, false)).toBe(false);
    expect(canOpen('appearance', 'STUDENT', false, false)).toBe(true);
    expect(canOpen('components', 'ADMIN', false, false)).toBe(false);
    expect(canOpen('components', 'ADMIN', false, true)).toBe(true);
  });
});

describe('textos', () => {
  it('título de la pestaña', () => {
    expect(pageTitle('students')).toBe('Estudiantes · WebClass');
  });

  it('una sección desconocida cae en Inicio', () => {
    expect(findSection('nope' as never).id).toBe('home');
  });

  it('rol principal: administrador antes que profesor y estudiante', () => {
    expect(primaryRoleLabel(['STUDENT', 'ADMIN'])).toBe('Administrador de institución');
    expect(primaryRoleLabel(['STUDENT', 'TEACHER'])).toBe('Profesor');
    expect(primaryRoleLabel(['STUDENT'])).toBe('Estudiante');
    expect(primaryRoleLabel([])).toBe('Sin rol');
  });
});
