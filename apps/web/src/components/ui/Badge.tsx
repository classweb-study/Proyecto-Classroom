import type { ReactNode } from 'react';

import { cx, statusTone, type Tone } from './logic';

/*
 * Píldora de estado o de rol. El texto siempre está: el color nunca es
 * la única señal (STYLEGUIDE.md, "Estados").
 */
export function Badge({
  tone = 'neutral',
  dot = false,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cx('ui-badge', `ui-badge--${tone}`)}>
      {dot && <span className="ui-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  DENIED: 'Denegada',
  VERIFIED: 'Verificada',
  REJECTED: 'Rechazada',
  ACTIVE: 'Activa',
};

/*
 * Badge a partir del estado que devuelve la API. Si el estado es nuevo
 * y no está en la lista, se muestra tal cual y en tono neutro.
 */
export function StatusBadge({
  status,
  label,
}: {
  status: string | null | undefined;
  label?: string;
}) {
  const text = label ?? (status ? STATUS_LABELS[status] ?? status : 'Sin estado');
  return <Badge tone={statusTone(status)}>{text}</Badge>;
}
