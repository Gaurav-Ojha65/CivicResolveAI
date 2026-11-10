import React, { forwardRef, useId } from 'react';
import { cn } from '../../lib/utils/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  isInvalid?: boolean;
  errorMessage?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      isInvalid = false,
      errorMessage,
      helperText,
      leftIcon,
      rightIcon,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    const hasError = isInvalid || Boolean(errorMessage);

    const describedBy = [
      hasError && errorMessage ? errorId : null,
      helperText ? helperId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="w-full">
        <div className="relative flex items-center">
          {leftIcon && (
            <div
              className="absolute left-3 flex items-center pointer-events-none text-ink-muted"
              aria-hidden="true"
            >
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={hasError ? 'true' : 'false'}
            aria-describedby={describedBy}
            className={cn(
              'w-full h-10 px-3 py-2 text-sm text-ink bg-surface rounded-lg transition-colors',
              'border border-border placeholder:text-ink-muted/60',
              'focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus',
              'disabled:bg-canvas disabled:text-ink-muted/70 disabled:cursor-not-allowed',
              leftIcon ? 'pl-9' : 'pl-3',
              rightIcon ? 'pr-9' : 'pr-3',
              hasError &&
                'border-semantic-danger-fg focus:border-semantic-danger-fg focus:ring-semantic-danger-fg text-semantic-danger-fg',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div
              className="absolute right-3 flex items-center pointer-events-none text-ink-muted"
              aria-hidden="true"
            >
              {rightIcon}
            </div>
          )}
        </div>
        {hasError && errorMessage && (
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 text-xs text-semantic-danger-fg font-medium"
          >
            {errorMessage}
          </p>
        )}
        {!hasError && helperText && (
          <p id={helperId} className="mt-1.5 text-xs text-ink-muted">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

