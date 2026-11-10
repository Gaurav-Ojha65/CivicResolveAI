import React from 'react';
import { cn } from '../../lib/utils/cn';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'outline';

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    'bg-canvas text-ink-muted border-border',
  success:
    'bg-semantic-success-bg text-semantic-success-fg border-semantic-success-border',
  warning:
    'bg-semantic-warning-bg text-semantic-warning-fg border-semantic-warning-border',
  danger:
    'bg-semantic-danger-bg text-semantic-danger-fg border-semantic-danger-border',
  info:
    'bg-semantic-info-bg text-semantic-info-fg border-semantic-info-border',
  outline:
    'bg-transparent text-ink border-border',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px] gap-1 rounded',
  md: 'px-2.5 py-1 text-xs gap-1.5 rounded-md',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  icon,
  className,
  ...props
}) => {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium border select-none tabular-nums',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {icon && (
        <span className="shrink-0 -ml-0.5" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
};

