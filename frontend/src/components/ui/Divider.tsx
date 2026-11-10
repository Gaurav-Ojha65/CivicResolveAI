import React from 'react';
import { cn } from '../../lib/utils/cn';

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  label?: string;
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  label,
  className,
  ...props
}) => {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn('inline-block w-px self-stretch bg-border min-h-[1rem]', className)}
        {...props}
      />
    );
  }

  if (label) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        className={cn('flex items-center my-4 select-none', className)}
        {...props}
      >
        <div className="flex-1 border-t border-border" />
        <span className="px-3 text-xs font-medium uppercase tracking-wider text-ink-muted">
          {label}
        </span>
        <div className="flex-1 border-t border-border" />
      </div>
    );
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn('w-full border-t border-border my-4', className)}
      {...props}
    />
  );
};

