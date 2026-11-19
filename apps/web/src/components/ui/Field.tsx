import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { ChevronDownIcon } from '../icons';
import { cx } from './logic';

/*
 * Campos de formulario (STYLEGUIDE.md, "Formularios"):
 * - etiqueta visible siempre; el placeholder no la reemplaza,
 * - ayuda debajo, unida con aria-describedby,
 * - error con aria-invalid y un mensaje que dice qué hacer,
 * - los opcionales se marcan "(opcional)"; los obligatorios no llevan asterisco.
 */

type FieldOwnProps = {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  /* Oculta la etiqueta a la vista (no a lectores). Solo para buscadores. */
  hideLabel?: boolean;
};

function useFieldIds(id?: string) {
  const generated = useId();
  const fieldId = id ?? `field-${generated}`;
  return {
    fieldId,
    hintId: `${fieldId}-hint`,
    errorId: `${fieldId}-error`,
  };
}

function describedBy(
  ids: { hintId: string; errorId: string },
  hint: ReactNode,
  error: string | null | undefined,
  extra?: string,
) {
  return cx(extra, hint ? ids.hintId : null, error ? ids.errorId : null) || undefined;
}

function FieldFrame({
  fieldId,
  hintId,
  errorId,
  label,
  hint,
  error,
  optional,
  hideLabel,
  children,
}: FieldOwnProps & {
  fieldId: string;
  hintId: string;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('ui-field', error && 'has-error')}>
      <label htmlFor={fieldId} className={cx('ui-field-label', hideLabel && 'visually-hidden')}>
        {label}
        {optional && <span className="ui-field-optional"> (opcional)</span>}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="ui-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="ui-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export type InputProps = FieldOwnProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    iconStart?: ReactNode;
  };

export function Input({
  label,
  hint,
  error,
  optional,
  hideLabel,
  iconStart,
  id,
  className,
  required,
  'aria-describedby': describedByProp,
  ...props
}: InputProps) {
  const ids = useFieldIds(id);

  return (
    <FieldFrame {...ids} label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel}>
      <span className={cx('ui-control', iconStart ? 'has-icon' : null)}>
        {iconStart && <span className="ui-control-icon">{iconStart}</span>}
        <input
          id={ids.fieldId}
          className={cx('ui-input', className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, hint, error, describedByProp)}
          required={required ?? !optional}
          {...props}
        />
      </span>
    </FieldFrame>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = FieldOwnProps &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: SelectOption[];
    /* Primera opción vacía, por ejemplo "Elige una institución". */
    placeholder?: string;
  };

export function Select({
  label,
  hint,
  error,
  optional,
  hideLabel,
  options,
  placeholder,
  id,
  className,
  required,
  'aria-describedby': describedByProp,
  ...props
}: SelectProps) {
  const ids = useFieldIds(id);

  return (
    <FieldFrame {...ids} label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel}>
      <span className="ui-control ui-control--select">
        <select
          id={ids.fieldId}
          className={cx('ui-input', 'ui-select', className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, hint, error, describedByProp)}
          required={required ?? !optional}
          {...props}
        >
          {placeholder !== undefined && (
            <option value="" disabled={!optional}>
              {placeholder}
            </option>
          )}
          {options.map(option => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="ui-select-chevron">
          <ChevronDownIcon />
        </span>
      </span>
    </FieldFrame>
  );
}

export type TextareaProps = FieldOwnProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({
  label,
  hint,
  error,
  optional,
  hideLabel,
  id,
  className,
  required,
  rows = 4,
  'aria-describedby': describedByProp,
  ...props
}: TextareaProps) {
  const ids = useFieldIds(id);

  return (
    <FieldFrame {...ids} label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel}>
      <textarea
        id={ids.fieldId}
        rows={rows}
        className={cx('ui-input', 'ui-textarea', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, hint, error, describedByProp)}
        required={required ?? !optional}
        {...props}
      />
    </FieldFrame>
  );
}

/* Agrupa campos con un título, como un <fieldset>. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="ui-form-section">
      <legend>{title}</legend>
      {description && <p className="ui-form-section-description">{description}</p>}
      <div className="ui-form-grid">{children}</div>
    </fieldset>
  );
}

/* Fila de botones al final del formulario: el principal va a la derecha. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="ui-form-actions">{children}</div>;
}
