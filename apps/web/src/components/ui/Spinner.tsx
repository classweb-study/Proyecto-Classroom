import { cx } from './logic';

/*
 * Indicador de carga. Si va solo (no dentro de un botón), pasa `label`
 * para que el lector de pantalla anuncie qué se está cargando.
 */
export function Spinner({
  size = 'md',
  label,
}: {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  if (!label) {
    return <span className={cx('ui-spinner', `ui-spinner--${size}`)} aria-hidden="true" />;
  }

  return (
    <span className="ui-spinner-wrap" role="status">
      <span className={cx('ui-spinner', `ui-spinner--${size}`)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
