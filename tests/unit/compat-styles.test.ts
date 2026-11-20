import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const compat = read('../../apps/web/src/styles/compat.css');
const tokens = read('../../apps/web/src/styles/tokens.css');

const defined = (css: string) =>
  new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]!));

/*
 * Variables viejas que usan las ramas feat/maura-access-requests y
 * feat/maura-admin-institution (revisado el 19 nov 2026). Si una rama
 * agrega otra --vmat-*, va aquí y en compat.css.
 */
const USED_BY_OTHER_BRANCHES = [
  '--vmat-auth-bg',
  '--vmat-bg',
  '--vmat-border',
  '--vmat-border-soft',
  '--vmat-danger-bg',
  '--vmat-danger-border',
  '--vmat-danger-surface',
  '--vmat-danger-text',
  '--vmat-green',
  '--vmat-green-hover',
  '--vmat-green-soft',
  '--vmat-green-soft-2',
  '--vmat-green-text',
  '--vmat-shadow',
  '--vmat-surface',
  '--vmat-surface-muted',
  '--vmat-surface-soft',
  '--vmat-text',
  '--vmat-text-faint',
  '--vmat-text-muted',
  '--vmat-text-strong',
  '--vmat-topbar',
  '--vmat-warning-bg',
  '--vmat-warning-text',
];

describe('compat.css', () => {
  const compatNames = defined(compat);
  const tokenNames = defined(tokens);

  it.each(USED_BY_OTHER_BRANCHES)('define %s', name => {
    expect(compatNames.has(name)).toBe(true);
  });

  it('cada alias apunta a un token que existe en tokens.css', () => {
    const references = [...compat.matchAll(/var\((--[\w-]+)\)/g)].map(match => match[1]!);
    const missing = references.filter(name => !tokenNames.has(name) && !compatNames.has(name));
    expect(missing).toEqual([]);
  });

  it('no redefine ningún token nuevo (solo agrega nombres viejos)', () => {
    const overlap = [...compatNames].filter(name => tokenNames.has(name));
    expect(overlap).toEqual([]);
  });

  it('no escribe colores fijos', () => {
    expect(compat.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });
});
