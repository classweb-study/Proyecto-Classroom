import type { ReactNode } from 'react';

import { cx } from './logic';

/*
 * Estado vacío honesto: dice por qué no hay datos y qué va a pasar.
 * No pongas una acción si la función todavía no existe.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
  size = 'md',
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  size?: 'md' | 'lg';
}) {
  return (
    <div className={cx('ui-empty', `ui-empty--${size}`)}>
      {icon && (
        <span className="ui-empty-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
