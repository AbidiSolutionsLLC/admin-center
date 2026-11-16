import React, { useId } from 'react';
import { cn } from '@/utils/cn';

export interface FormFieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** A control, or a function that receives the id and aria props to spread onto it. */
  children: React.ReactNode | ((props: FormFieldControlProps) => React.ReactNode);
  className?: string;
}

/**
 * FormField: label, hint, error and required marker around one control (DRD 9.2).
 * Pass a function as children to get the `id` and aria props for the control.
 */
export const FormField: React.FC<FormFieldProps> = ({ label, hint, error, required, children, className }) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const controlProps: FormFieldControlProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required ? true : undefined,
  };
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-table font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-error" aria-hidden>
            *
          </span>
        )}
      </label>
      {typeof children === 'function' ? children(controlProps) : children}
      {hint && !error && (
        <p id={hintId} className="text-table text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-table text-error">
          {error}
        </p>
      )}
    </div>
  );
};
