/*
 * Lógica de los componentes que no necesita React ni el DOM.
 * Se prueba en tests/unit/ui-logic.test.ts.
 */

/* Une clases y descarta las vacías: cx('btn', active && 'on'). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ---------- Badge ---------- */

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

/*
 * Estados que devuelve la API → tono visual (STYLEGUIDE.md, "Estados").
 * Lo desconocido o null queda neutro en vez de inventar un color.
 */
export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case 'APPROVED':
    case 'VERIFIED':
    case 'ACTIVE':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'DENIED':
    case 'REJECTED':
      return 'danger';
    default:
      return 'neutral';
  }
}

/* ---------- Tabs ---------- */

/*
 * Índice de la pestaña que recibe el foco al presionar una tecla,
 * siguiendo el patrón de pestañas de WAI-ARIA. Salta las deshabilitadas.
 * Devuelve null si la tecla no mueve el foco.
 */
export function nextTabIndex(
  key: string,
  current: number,
  disabled: readonly boolean[],
): number | null {
  const count = disabled.length;
  if (count === 0 || disabled.every(Boolean)) return null;

  const firstEnabled = (from: number, step: 1 | -1) => {
    let index = from;
    for (let i = 0; i < count; i += 1) {
      index = (index + count) % count;
      if (!disabled[index]) return index;
      index += step;
    }
    return null;
  };

  switch (key) {
    case 'ArrowRight':
      return firstEnabled(current + 1, 1);
    case 'ArrowLeft':
      return firstEnabled(current - 1, -1);
    case 'Home':
      return firstEnabled(0, 1);
    case 'End':
      return firstEnabled(count - 1, -1);
    default:
      return null;
  }
}

/* ---------- Toast ---------- */

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export type ToastInput = {
  tone?: ToastTone;
  title: string;
  description?: string;
};

export type ToastItem = Required<Pick<ToastInput, 'tone' | 'title'>> &
  Pick<ToastInput, 'description'> & { id: number };

export const MAX_TOASTS = 3;
export const TOAST_DURATION_MS = 5000;

export type ToastAction =
  | { type: 'add'; toast: ToastItem }
  | { type: 'dismiss'; id: number };

/* Cola de avisos: los más nuevos al final, nunca más de MAX_TOASTS. */
export function toastReducer(state: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case 'add':
      return [...state, action.toast].slice(-MAX_TOASTS);
    case 'dismiss':
      return state.filter(toast => toast.id !== action.id);
  }
}

/* Los errores se quedan hasta que la persona los cierre (guía de estilos). */
export function toastAutoDismisses(tone: ToastTone): boolean {
  return tone !== 'danger';
}
