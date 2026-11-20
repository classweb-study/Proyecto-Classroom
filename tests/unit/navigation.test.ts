import { describe, expect, it } from 'vitest';

import {
  SECTIONS,
  breadcrumbsFor,
  findSection,
  normalizeText,
  pageTitle,
  primaryRoleLabel,
  searchSections,
  visibleSections,
} from '../../apps/web/src/navigation/sections.js';

const prod = visibleSections(false);
const dev = visibleSections(true);
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
    expect(ids(searchSections('institucion', prod))).toEqual(['institution']);
    // Usuarios va primero por nombre; Mi perfil aparece después por la palabra clave "usuario".
    expect(ids(searchSections('USU', prod))).toEqual(['users', 'profile']);
  });

  it('busca también por palabras clave', () => {
    expect(ids(searchSections('cuenta', prod))).toEqual(['profile']);
    expect(ids(searchSections('tema', prod))).toEqual(['appearance']);
    expect(ids(searchSections('solicitudes', prod))).toEqual(['users']);
    expect(ids(searchSections('docentes', prod))).toEqual(['teachers']);
  });

  it('pone primero lo que empieza igual, después lo que lo contiene y al final las palabras clave', () => {
    // "es": Estudiantes empieza por "es"; Profesores lo contiene; Usuarios solo por palabra clave ("pendientes").
    expect(ids(searchSections('es', prod)).slice(0, 2)).toEqual(['students', 'teachers']);
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
      { label: 'Usuarios' },
    ]);
    expect(breadcrumbsFor('appearance', 'Universidad X')[1]).toEqual({ label: 'Ajustes' });
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
    expect(primaryRoleLabel(['STUDENT', 'ADMIN'])).toBe('Administrador');
    expect(primaryRoleLabel(['STUDENT', 'TEACHER'])).toBe('Profesor');
    expect(primaryRoleLabel(['STUDENT'])).toBe('Estudiante');
    expect(primaryRoleLabel([])).toBe('Sin rol');
  });
});
