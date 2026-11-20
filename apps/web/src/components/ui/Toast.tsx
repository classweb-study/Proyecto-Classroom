import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import { CloseIcon, ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '../icons';
import { IconButton } from './Button';
import {
  TOAST_DURATION_MS,
  cx,
  toastAutoDismisses,
  toastReducer,
  type ToastInput,
  type ToastItem,
  type ToastTone,
} from './logic';

/*
 * Confirmaciones breves ("Solicitud aprobada"). Envuelve la app en
 * <ToastProvider> y llama a useToast() desde cualquier pantalla:
 *
 *   const toast = useToast();
 *   toast({ tone: 'success', title: 'Solicitud aprobada' });
 *
 * Los avisos normales se van solos a los 5 s; los de error se quedan
 * hasta que la persona los cierre. Máximo 3 a la vez.
 */

type ToastContextValue = (input: ToastInput) => void;

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTone, ReactNode> = {
  success: <SuccessIcon />,
  info: <InfoIcon />,
  warning: <WarningIcon />,
  danger: <ErrorIcon />,
};

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (!toastAutoDismisses(toast.tone)) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className={cx('ui-toast', `ui-toast--${toast.tone}`)} role={toast.tone === 'danger' ? 'alert' : undefined}>
      <span className="ui-toast-icon">{ICONS[toast.tone]}</span>
      <div className="ui-toast-body">
        <strong>{toast.title}</strong>
        {toast.description && <span>{toast.description}</span>}
      </div>
      <IconButton label="Cerrar aviso" icon={<CloseIcon />} size="sm" onClick={() => onDismiss(toast.id)} />
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => dispatch({ type: 'dismiss', id }), []);

  const show = useCallback<ToastContextValue>(input => {
    dispatch({
      type: 'add',
      toast: {
        id: nextId.current++,
        tone: input.tone ?? 'info',
        title: input.title,
        description: input.description,
      },
    });
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* La región existe siempre: los lectores solo anuncian cambios en regiones ya presentes. */}
      <div className="ui-toast-region" role="region" aria-label="Avisos" aria-live="polite">
        {toasts.map(toast => (
          <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  }
  return context;
}
