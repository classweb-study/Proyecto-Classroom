import { useSyncExternalStore } from 'react';

import {
  DEFAULT_APPEARANCE,
  fallbackAccent,
  normalizeAppearance,
  type Appearance,
} from './appearance';

/*
 * Guarda la apariencia en localStorage y la aplica como
 * data-theme / data-accent en <html>. No usa cookies ni servidor:
 * cuando exista un endpoint de preferencias, solo cambia este archivo.
 */

const STORAGE_KEY = 'vmat-appearance';
const LEGACY_THEME_KEY = 'vmat-theme';

type Listener = () => void;

const listeners = new Set<Listener>();
let current: Appearance = DEFAULT_APPEARANCE;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(value: Appearance) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    window.localStorage.removeItem(LEGACY_THEME_KEY);
  } catch {
    // Navegación privada o almacenamiento lleno: se aplica igual, solo no persiste.
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function loadAppearance(): Appearance {
  const stored = readStorage(STORAGE_KEY);

  if (stored) {
    try {
      return normalizeAppearance(JSON.parse(stored), systemPrefersDark());
    } catch {
      // JSON dañado: se ignora y se sigue con lo demás.
    }
  }

  // Quien ya usaba el botón claro/oscuro anterior conserva su elección.
  const legacy = readStorage(LEGACY_THEME_KEY);
  return normalizeAppearance(
    legacy === 'light' || legacy === 'dark' ? { theme: legacy } : null,
    systemPrefersDark(),
  );
}

function applyToDocument(value: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = value.theme;
  root.dataset.accent = value.accent;
}

/* Se llama una vez, antes del primer render, para evitar el parpadeo. */
export function initAppearance(): Appearance {
  current = loadAppearance();
  applyToDocument(current);
  return current;
}

export function getAppearance(): Appearance {
  return current;
}

export function setAppearance(next: Partial<Appearance>) {
  const theme = next.theme ?? current.theme;
  const accent = fallbackAccent(theme, next.accent ?? current.accent);
  const value: Appearance = { theme, accent };

  if (value.theme === current.theme && value.accent === current.accent) {
    return;
  }

  current = value;
  applyToDocument(value);
  writeStorage(value);
  listeners.forEach(listener => listener());
}

export function resetAppearance() {
  setAppearance(DEFAULT_APPEARANCE);
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getAppearance, getAppearance);
}
