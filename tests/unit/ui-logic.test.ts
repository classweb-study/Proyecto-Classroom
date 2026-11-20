import { describe, expect, it } from 'vitest';

import {
  MAX_TOASTS,
  cx,
  nextTabIndex,
  statusTone,
  toastAutoDismisses,
  toastReducer,
  type ToastItem,
} from '../../apps/web/src/components/ui/logic.js';

describe('cx', () => {
  it('une clases y descarta valores vacíos', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
    expect(cx()).toBe('');
  });
});

describe('statusTone', () => {
  it.each([
    ['PENDING', 'warning'],
    ['APPROVED', 'success'],
    ['VERIFIED', 'success'],
    ['ACTIVE', 'success'],
    ['DENIED', 'danger'],
    ['REJECTED', 'danger'],
  ] as const)('%s → %s', (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });

  it('deja neutro lo desconocido o vacío en vez de inventar un color', () => {
    expect(statusTone('CANCELLED')).toBe('neutral');
    expect(statusTone(null)).toBe('neutral');
    expect(statusTone(undefined)).toBe('neutral');
  });
});

describe('nextTabIndex', () => {
  const none = [false, false, false, false];

  it('avanza y retrocede con las flechas, dando la vuelta', () => {
    expect(nextTabIndex('ArrowRight', 0, none)).toBe(1);
    expect(nextTabIndex('ArrowRight', 3, none)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, none)).toBe(3);
  });

  it('Inicio y Fin van a la primera y a la última', () => {
    expect(nextTabIndex('Home', 2, none)).toBe(0);
    expect(nextTabIndex('End', 0, none)).toBe(3);
  });

  it('salta las pestañas deshabilitadas', () => {
    const disabled = [false, true, false, true];
    expect(nextTabIndex('ArrowRight', 0, disabled)).toBe(2);
    expect(nextTabIndex('ArrowRight', 2, disabled)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, disabled)).toBe(2);
    expect(nextTabIndex('End', 0, disabled)).toBe(2);
    expect(nextTabIndex('Home', 2, [true, false, false])).toBe(1);
  });

  it('ignora otras teclas y grupos sin pestañas activas', () => {
    expect(nextTabIndex('Enter', 0, none)).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, [true, true])).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, [])).toBeNull();
  });
});

describe('toastReducer', () => {
  const make = (id: number): ToastItem => ({ id, tone: 'info', title: `Aviso ${id}` });

  it('agrega al final y nunca guarda más del máximo', () => {
    let state: ToastItem[] = [];
    for (let id = 1; id <= MAX_TOASTS + 2; id += 1) {
      state = toastReducer(state, { type: 'add', toast: make(id) });
    }
    expect(state).toHaveLength(MAX_TOASTS);
    expect(state.map(toast => toast.id)).toEqual([3, 4, 5]);
  });

  it('cierra solo el aviso indicado', () => {
    const state = [make(1), make(2)];
    expect(toastReducer(state, { type: 'dismiss', id: 1 })).toEqual([make(2)]);
    expect(toastReducer(state, { type: 'dismiss', id: 99 })).toEqual(state);
  });

  it('los errores no se cierran solos', () => {
    expect(toastAutoDismisses('danger')).toBe(false);
    expect(toastAutoDismisses('success')).toBe(true);
    expect(toastAutoDismisses('info')).toBe(true);
    expect(toastAutoDismisses('warning')).toBe(true);
  });
});
