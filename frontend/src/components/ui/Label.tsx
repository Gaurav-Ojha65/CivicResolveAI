import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils/cn';

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ children, required = false, className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'block text-xs font-semibold uppercase tracking-wider text-ink-deep mb-1.5 select-none',
          className
        )}
        {...props}
      >
        {children}
        {required && (
          <span
            className="text-semantic-danger-fg ml-1"
            title="Required"
            aria-hidden="true"
          >
            *
          </span>
        )}
      </label>
    );
  }
);

Label.displayName = 'Label';

