import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  THEMES,
  accentChangeNotice,
  accentUnavailableReason,
  allowedAccents,
  fallbackAccent,
  isAccentAllowed,
  isDefaultAppearance,
  nextTheme,
  normalizeAppearance,
  type Accent,
  type Theme,
} from '../../apps/web/src/theme/appearance.js';

const tokensPath = fileURLToPath(
  new URL('../../apps/web/src/styles/tokens.css', import.meta.url),
);

// Sin comentarios ni bloques @media: solo interesan los valores por defecto.
const css = readFileSync(tokensPath, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');

type Rule = {
  attributes: Record<string, string>;
  specificity: number;
  order: number;
  declarations: Map<string, string>;
};

const rules: Rule[] = [];

for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const declarations = new Map<string, string>();

  for (const declaration of match[2]!.split(';')) {
    const index = declaration.indexOf(':');
    if (index === -1) continue;
    const name = declaration.slice(0, index).trim();
    if (name.startsWith('--')) {
      declarations.set(name, declaration.slice(index + 1).trim());
    }
  }

  for (const selector of match[1]!.split(',')) {
    const trimmed = selector.trim();
    if (!trimmed.startsWith(':root') && !trimmed.startsWith('[data-')) continue;

    const attributes: Record<string, string> = {};
    for (const attr of trimmed.matchAll(/\[(data-[\w-]+)='([\w-]+)'\]/g)) {
      attributes[attr[1]!] = attr[2]!;
    }

    rules.push({
      attributes,
      specificity:
        Object.keys(attributes).length + (trimmed.startsWith(':root') ? 1 : 0),
      order: rules.length,
      declarations,
    });
  }
}

/* Valores finales de :root para una base y un secundario, como haría el navegador. */
function tokensFor(theme: Theme, accent: Accent): Map<string, string> {
  const element: Record<string, string> = {
    'data-theme': theme,
    'data-accent': accent,
  };

  const matching = rules
    .filter(rule =>
      Object.entries(rule.attributes).every(
        ([name, value]) => element[name] === value,
      ),
    )
    .sort((a, b) => a.specificity - b.specificity || a.order - b.order);

  const tokens = new Map<string, string>();
  for (const rule of matching) {
    for (const [name, value] of rule.declarations) tokens.set(name, value);
  }
  return tokens;
}

function resolve(tokens: Map<string, string>, name: string, depth = 0): string {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Token sin definir: ${name}`);
  if (depth > 10) throw new Error(`Referencia circular en ${name}`);

  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference ? resolve(tokens, reference[1]!, depth + 1) : value;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Se esperaba un color hex de 6 dígitos: ${hex}`);

  const channels = [0, 2, 4].map(offset => {
    const value = parseInt(match[1]!.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(tokens: Map<string, string>, foreground: string, background: string) {
  const a = luminance(resolve(tokens, foreground));
  const b = luminance(resolve(tokens, background));
  const [high, low] = a > b ? [a, b] : [b, a];
  return (high + 0.05) / (low + 0.05);
}

// Texto normal: WCAG 2.2 AA exige 4.5:1.
const baseTextPairs: Array<[string, string]> = [
  ['--color-text', '--color-bg'],
  ['--color-text', '--color-surface'],
  ['--color-text-strong', '--color-surface'],
  ['--color-text-muted', '--color-bg'],
  ['--color-text-muted', '--color-surface'],
  ['--color-text-muted', '--color-surface-sunken'],
  ['--color-text-subtle', '--color-surface'],
  ['--inverse-text', '--inverse-bg'],
  ['--success-text', '--success-bg'],
  ['--warning-text', '--warning-bg'],
  ['--danger-text', '--danger-bg'],
  ['--danger-text', '--color-surface'],
  ['--danger-on-solid', '--danger-solid'],
  ['--info-text', '--info-bg'],
];

const accentTextPairs: Array<[string, string]> = [
  ['--deny-text', '--deny-bg'],
  ['--deny-text', '--deny-bg-hover'],
  ['--accent-on-solid', '--accent-solid'],
  ['--accent-on-solid', '--accent-solid-hover'],
  ['--accent-text', '--accent-soft'],
  ['--accent-text', '--accent-soft-hover'],
  ['--accent-text', '--color-surface'],
];

// Elementos de interfaz (botón principal contra el fondo): AA exige 3:1.
const accentUiPairs: Array<[string, string]> = [
  ['--accent-solid', '--color-surface'],
  ['--accent-solid', '--color-bg'],
];

const allowedCombinations = THEMES.flatMap(theme =>
  allowedAccents(theme).map(accent => [theme, accent] as const),
);

describe.each(THEMES)('base %s', theme => {
  const tokens = tokensFor(theme, 'green');

  it.each(baseTextPairs)('%s sobre %s cumple 4.5:1', (fg, bg) => {
    expect(contrast(tokens, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(allowedCombinations)('base %s con secundario %s', (theme, accent) => {
  const tokens = tokensFor(theme, accent);

  it.each(accentTextPairs)('%s sobre %s cumple 4.5:1', (fg, bg) => {
    expect(contrast(tokens, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(accentUiPairs)('%s sobre %s cumple 3:1', (fg, bg) => {
    expect(contrast(tokens, fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('estructura de los tokens', () => {
  const semanticPrefixes = ['--color-', '--inverse-', '--success-', '--warning-', '--danger-', '--info-', '--shadow-'];

  it('cada base define los mismos tokens semánticos', () => {
    const names = (theme: Theme) =>
      [...rules.filter(rule => rule.attributes['data-theme'] === theme && rule.specificity === 1)
        .flatMap(rule => [...rule.declarations.keys()])]
        .filter(name => semanticPrefixes.some(prefix => name.startsWith(prefix)))
        .sort();

    expect(names('dark')).toEqual(names('light'));
    expect(names('gray')).toEqual(names('light'));
  });

  it('cada secundario permitido tiene valores propios en su base', () => {
    for (const [theme, accent] of allowedCombinations) {
      const own = rules.filter(
        rule =>
          rule.attributes['data-accent'] === accent &&
          (theme === 'light'
            ? rule.attributes['data-theme'] === undefined
            : rule.attributes['data-theme'] === theme),
      );
      expect(own.length, `${theme}/${accent}`).toBeGreaterThan(0);
      expect(own[0]!.declarations.size, `${theme}/${accent}`).toBe(7);
    }
  });

  it('la escala de espaciado es múltiplo de 4px', () => {
    const base = tokensFor('light', 'green');
    for (const [name, value] of base) {
      if (!name.startsWith('--space-') || value === '0') continue;
      expect((parseFloat(value) * 16) % 4, `${name} = ${value}`).toBe(0);
    }
  });

  it('ningún tamaño de texto baja de 12px', () => {
    const base = tokensFor('light', 'green');
    for (const [name, value] of base) {
      if (!name.startsWith('--text-') || value.startsWith('clamp')) continue;
      expect(parseFloat(value) * 16, name).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('reglas de apariencia', () => {
  it('bloquea los secundarios que se confunden con la base', () => {
    expect(isAccentAllowed('light', 'white')).toBe(false);
    expect(isAccentAllowed('dark', 'black')).toBe(false);
    expect(isAccentAllowed('gray', 'black')).toBe(false);
    expect(isAccentAllowed('light', 'black')).toBe(true);
    expect(isAccentAllowed('dark', 'white')).toBe(true);
    expect(isAccentAllowed('gray', 'white')).toBe(true);
  });

  it('cambia blanco por negro (y al revés) cuando la base no lo admite', () => {
    expect(fallbackAccent('light', 'white')).toBe('black');
    expect(fallbackAccent('dark', 'black')).toBe('white');
    expect(fallbackAccent('gray', 'blue')).toBe('blue');
  });

  it('normaliza valores guardados inválidos sin lanzar errores', () => {
    expect(normalizeAppearance(null)).toEqual({ theme: 'light', accent: 'green' });
    expect(normalizeAppearance(null, true)).toEqual({ theme: 'dark', accent: 'green' });
    expect(normalizeAppearance({ theme: 'sepia', accent: 'oro' })).toEqual({ theme: 'light', accent: 'green' });
    expect(normalizeAppearance({ theme: 'light', accent: 'white' })).toEqual({ theme: 'light', accent: 'black' });
    expect(normalizeAppearance('basura')).toEqual({ theme: 'light', accent: 'green' });
    expect(normalizeAppearance({ theme: 'gray', accent: 'pink' })).toEqual({ theme: 'gray', accent: 'pink' });
  });

  it('el botón rápido recorre las tres bases', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('gray');
    expect(nextTheme('gray')).toBe('light');
  });

  it('con secundario rojo, Denegar es rojo sólido con letras blancas', () => {
    for (const theme of THEMES) {
      const tokens = tokensFor(theme, 'red');
      expect(resolve(tokens, '--deny-text'), theme).toBe('#ffffff');
      expect(resolve(tokens, '--deny-bg'), theme).toMatch(/^#[a-f0-9]{6}$/);
      expect(resolve(tokens, '--deny-bg'), theme).not.toBe(resolve(tokens, '--color-surface'));
    }
    expect(resolve(tokensFor('light', 'green'), '--deny-bg')).toBe('#ffffff');
  });

  it('hay siete secundarios y tres bases', () => {
    expect(ACCENTS).toHaveLength(7);
    expect(THEMES).toHaveLength(3);
  });

  it('explica por qué un secundario no está disponible', () => {
    expect(accentUnavailableReason('light', 'white')).toBe(
      'Blanco no está disponible con la base blanca: se perdería contra el fondo.',
    );
    expect(accentUnavailableReason('gray', 'black')).toContain('base gris');
    expect(accentUnavailableReason('dark', 'blue')).toBeNull();
  });

  it('avisa cuando el secundario cambia solo al cambiar de base', () => {
    expect(accentChangeNotice({ theme: 'dark', accent: 'white' }, 'light')).toBe(
      'Cambiamos el secundario a negro porque blanco no se ve sobre la base blanca.',
    );
    expect(accentChangeNotice({ theme: 'light', accent: 'blue' }, 'gray')).toBeNull();
  });

  it('reconoce la apariencia predeterminada', () => {
    expect(isDefaultAppearance(DEFAULT_APPEARANCE)).toBe(true);
    expect(isDefaultAppearance({ theme: 'gray', accent: 'green' })).toBe(false);
  });
});
