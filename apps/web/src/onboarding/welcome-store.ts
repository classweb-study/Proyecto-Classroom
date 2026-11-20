import { useSyncExternalStore } from 'react';

/*
 * Si la bienvenida ya se cerró. Vive en localStorage, igual que la
 * apariencia: es una comodidad de este navegador, no un dato de la cuenta.
 */

const KEY = 'vmat-welcome-dismissed';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function write(dismissed: boolean) {
  try {
    if (dismissed) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento la bienvenida vuelve a salir; no es grave.
  }
  listeners.forEach(listener => listener());
}

export function dismissWelcome() {
  write(true);
}

export function showWelcomeAgain() {
  write(false);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWelcomeDismissed(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}
