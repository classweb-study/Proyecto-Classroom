/*
 * Componentes reutilizables de VMAT. Importar desde aquí:
 *   import { Button, Card, Input, useToast } from '../components/ui';
 * Reglas visuales: apps/web/STYLEGUIDE.md. Ejemplos: catálogo de
 * componentes (solo en desarrollo, src/pages/ComponentCatalogPage.tsx).
 */
export { Alert, type AlertTone } from './Alert';
export { Badge, StatusBadge } from './Badge';
export { Button, IconButton, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export { Card, type CardProps } from './Card';
export { EmptyState } from './EmptyState';
export {
  FormActions,
  FormSection,
  Input,
  Select,
  Textarea,
  type InputProps,
  type SelectOption,
  type SelectProps,
  type TextareaProps,
} from './Field';
export { cx, statusTone, type Tone } from './logic';
export { Modal } from './Modal';
export { Spinner } from './Spinner';
export { Table, type TableColumn, type TableState } from './Table';
export { Tabs, type TabItem } from './Tabs';
export { ToastProvider, useToast } from './Toast';
