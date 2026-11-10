import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils/cn';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-teal-trust text-white hover:bg-teal-trust-hover active:bg-[#094E49] shadow-sm',
  secondary:
    'bg-surface text-ink-deep border border-border hover:bg-canvas hover:text-ink active:bg-gray-100 shadow-sm',
  outline:
    'bg-transparent text-teal-trust border border-teal-trust hover:bg-teal-trust-light active:bg-teal-100',
  destructive:
    'bg-semantic-danger-fg text-white hover:bg-[#991B1B] active:bg-[#7F1D1D] shadow-sm',
  ghost:
    'bg-transparent text-ink-muted hover:text-ink-deep hover:bg-canvas active:bg-gray-100',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs font-medium rounded-md gap-1.5',
  md: 'h-10 px-4 text-sm font-medium rounded-lg gap-2',
  lg: 'h-12 px-6 text-base font-semibold rounded-xl gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      className,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading}
        aria-disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center transition-colors font-sans select-none',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
          'disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <Loader2
            className="animate-spin -ml-0.5 shrink-0"
            size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16}
            aria-hidden="true"
          />
        )}
        {!isLoading && leftIcon && (
          <span className="shrink-0 -ml-0.5" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && (
          <span className="shrink-0 -mr-0.5" aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

