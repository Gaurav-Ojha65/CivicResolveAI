import React from 'react';
import { cn } from '../../lib/utils/cn';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 md:p-12',
        'bg-surface border border-dashed border-border rounded-xl',
        className
      )}
      {...props}
    >
      <div
        className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center text-ink-muted mb-3"
        aria-hidden="true"
      >
        {icon || <Inbox size={22} />}
      </div>
      <h4 className="text-sm font-semibold text-ink-deep tracking-tight mb-1">
        {title}
      </h4>
      {description && (
        <p className="text-xs text-ink-muted max-w-sm mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
};

