import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from './logic';
import { Spinner } from './Spinner';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'danger-soft';

export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /* Muestra un indicador y bloquea el botón mientras termina la acción. */
  loading?: boolean;
  /* Texto durante la carga, en gerundio: "Aprobando…". */
  loadingText?: string;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  fullWidth?: boolean;
};

/*
 * Botón de VMAT. Por defecto es type="button" para que nunca envíe un
 * formulario sin querer; usa type="submit" de forma explícita.
 * "danger-soft" usa los tokens --deny-*: con secundario rojo pasa a sólido.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  loadingText,
  iconStart,
  iconEnd,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'ui-button',
        `ui-button--${variant}`,
        `ui-button--${size}`,
        fullWidth && 'ui-button--full',
        loading && 'is-loading',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : iconStart}
      <span>{loading && loadingText ? loadingText : children}</span>
      {!loading && iconEnd}
    </button>
  );
}

/* Botón de solo icono: exige una etiqueta para lectores de pantalla. */
export function IconButton({
  label,
  icon,
  className,
  size = 'md',
  variant = 'ghost',
  ...props
}: Omit<ButtonProps, 'children' | 'iconStart' | 'iconEnd' | 'aria-label'> & {
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cx(
        'ui-button',
        `ui-button--${variant}`,
        `ui-button--${size}`,
        'ui-button--icon',
        className,
      )}
      aria-label={label}
      title={label}
      {...props}
    >
      {icon}
    </button>
  );
}
