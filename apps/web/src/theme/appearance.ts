/*
 * Apariencia: color base (tema) y color secundario (acento).
 *
 * Este archivo no toca el DOM ni localStorage, para poder probarlo
 * desde tests/unit sin navegador. Los valores de cada color están en
 * src/styles/tokens.css, en los bloques [data-theme] y [data-accent].
 */

export const THEMES = ['light', 'dark', 'gray'] as const;
export type Theme = (typeof THEMES)[number];

export const ACCENTS = [
  'green',
  'blue',
  'purple',
  'pink',
  'red',
  'black',
  'white',
] as const;
export type Accent = (typeof ACCENTS)[number];

export type Appearance = {
  theme: Theme;
  accent: Accent;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'light',
  accent: 'green',
};

export const THEME_LABELS: Record<Theme, string> = {
  light: 'Blanco',
  dark: 'Negro',
  gray: 'Gris',
};

/* Para frases como "la base blanca". */
export const THEME_ADJECTIVES: Record<Theme, string> = {
  light: 'blanca',
  dark: 'negra',
  gray: 'gris',
};

export const ACCENT_LABELS: Record<Accent, string> = {
  green: 'Verde',
  blue: 'Azul',
  purple: 'Morado',
  pink: 'Rosa',
  red: 'Rojo',
  black: 'Negro',
  white: 'Blanco',
};

/*
 * Un secundario igual al fondo deja botones y menús invisibles:
 * blanco sobre base blanca, negro sobre bases negra o gris.
 */
const BLOCKED: Record<Theme, readonly Accent[]> = {
  light: ['white'],
  dark: ['black'],
  gray: ['black'],
};

export function isAccentAllowed(theme: Theme, accent: Accent): boolean {
  return !BLOCKED[theme].includes(accent);
}

export function allowedAccents(theme: Theme): Accent[] {
  return ACCENTS.filter(accent => isAccentAllowed(theme, accent));
}

/* Secundario que se usa cuando el elegido no sirve con la base. */
export function fallbackAccent(theme: Theme, accent: Accent): Accent {
  if (isAccentAllowed(theme, accent)) return accent;
  if (accent === 'white') return 'black';
  if (accent === 'black') return 'white';
  return DEFAULT_APPEARANCE.accent;
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function isAccent(value: unknown): value is Accent {
  return typeof value === 'string' && (ACCENTS as readonly string[]).includes(value);
}

/*
 * Convierte cualquier valor guardado (o basura) en una apariencia válida.
 * `systemPrefersDark` solo se usa si no hay un tema guardado.
 */
export function normalizeAppearance(
  raw: unknown,
  systemPrefersDark = false,
): Appearance {
  const candidate =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};

  const theme = isTheme(candidate.theme)
    ? candidate.theme
    : systemPrefersDark
      ? 'dark'
      : DEFAULT_APPEARANCE.theme;

  const accent = isAccent(candidate.accent)
    ? candidate.accent
    : DEFAULT_APPEARANCE.accent;

  return { theme, accent: fallbackAccent(theme, accent) };
}

/* Siguiente base para el botón rápido de la barra superior. */
export function nextTheme(theme: Theme): Theme {
  const index = THEMES.indexOf(theme);
  return THEMES[(index + 1) % THEMES.length]!;
}

export const THEME_DESCRIPTIONS: Record<Theme, string> = {
  light: 'Fondo claro. La opción predeterminada.',
  dark: 'Fondo casi negro, para poca luz.',
  gray: 'Oscuro atenuado, con menos contraste que el negro.',
};

/* Texto que explica por qué un secundario no se puede usar con una base. */
export function accentUnavailableReason(
  theme: Theme,
  accent: Accent,
): string | null {
  if (isAccentAllowed(theme, accent)) return null;
  return `${ACCENT_LABELS[accent]} no está disponible con la base ${THEME_ADJECTIVES[theme]}: se perdería contra el fondo.`;
}

/*
 * Al cambiar de base, el secundario puede cambiar solo (blanco ↔ negro).
 * Devuelve el aviso para la persona, o null si no cambió nada.
 */
export function accentChangeNotice(
  previous: Appearance,
  nextThemeValue: Theme,
): string | null {
  const accent = fallbackAccent(nextThemeValue, previous.accent);
  if (accent === previous.accent) return null;
  return `Cambiamos el secundario a ${ACCENT_LABELS[accent].toLowerCase()} porque ${ACCENT_LABELS[previous.accent].toLowerCase()} no se ve sobre la base ${THEME_ADJECTIVES[nextThemeValue]}.`;
}

export function isDefaultAppearance(value: Appearance): boolean {
  return (
    value.theme === DEFAULT_APPEARANCE.theme &&
    value.accent === DEFAULT_APPEARANCE.accent
  );
}
