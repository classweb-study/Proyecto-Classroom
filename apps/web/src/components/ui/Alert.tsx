import type { ReactNode } from 'react';

import { ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '../icons';
import { cx } from './logic';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ICONS: Record<AlertTone, ReactNode> = {
  info: <InfoIcon />,
  success: <SuccessIcon />,
  warning: <WarningIcon />,
  danger: <ErrorIcon />,
};

/*
 * Aviso dentro de la página (solicitud pendiente, sin institución, error).
 * Los de peligro se anuncian de inmediato (role="alert"); los demás no
 * interrumpen al lector de pantalla.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cx('ui-alert', `ui-alert--${tone}`)} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="ui-alert-icon">{ICONS[tone]}</span>
      <div className="ui-alert-body">
        <strong>{title}</strong>
        {children && <div className="ui-alert-text">{children}</div>}
        {actions && <div className="ui-alert-actions">{actions}</div>}
      </div>
    </div>
  );
}
