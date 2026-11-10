import React from 'react';
import { cn } from '../../lib/utils/cn';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'An error occurred',
  message,
  onRetry,
  retryLabel = 'Try Again',
  className,
  ...props
}) => {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 md:p-12',
        'bg-semantic-danger-bg/40 border border-semantic-danger-border rounded-xl',
        className
      )}
      {...props}
    >
      <div
        className="w-12 h-12 rounded-full bg-semantic-danger-bg flex items-center justify-center text-semantic-danger-fg mb-3"
        aria-hidden="true"
      >
        <AlertCircle size={22} />
      </div>
      <h4 className="text-sm font-semibold text-semantic-danger-fg tracking-tight mb-1">
        {title}
      </h4>
      <p className="text-xs text-ink-muted max-w-sm mb-4 leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          leftIcon={<RotateCcw size={14} />}
          className="border-semantic-danger-fg text-semantic-danger-fg hover:bg-semantic-danger-bg"
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
};

