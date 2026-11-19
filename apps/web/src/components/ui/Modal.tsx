import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { CloseIcon } from '../icons';
import { IconButton } from './Button';
import { cx } from './logic';

/*
 * Ventana modal sobre <dialog> nativo. El navegador ya resuelve lo
 * difícil: mantiene el foco dentro, cierra con Escape, deja inerte el
 * resto de la página y devuelve el foco al botón que la abrió.
 *
 * Uso:
 *   <Modal open={open} onClose={() => setOpen(false)} title="Revocar rol"
 *          footer={<><Button onClick={cerrar}>Cancelar</Button>
 *                    <Button variant="danger">Revocar</Button></>}>
 *     ...
 *   </Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  /* Para acciones que no deben cerrarse por accidente (formularios a medias). */
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeOnBackdrop?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    // El clic cae en el <dialog> mismo solo cuando es fuera de la caja.
    if (closeOnBackdrop && event.target === dialogRef.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className={cx('ui-modal', `ui-modal--${size}`)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={event => {
        // Escape: se cierra desde el estado de React, no solo en el DOM.
        event.preventDefault();
        onClose();
      }}
      onClick={onBackdropClick}
    >
      <div className="ui-modal-box">
        <header className="ui-modal-header">
          <div>
            <h2 id={titleId} className="ui-modal-title">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="ui-modal-description">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Cerrar" icon={<CloseIcon />} size="sm" onClick={onClose} />
        </header>

        {children && <div className="ui-modal-body">{children}</div>}
        {footer && <footer className="ui-modal-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
