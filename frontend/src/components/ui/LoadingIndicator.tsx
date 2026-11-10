import React from 'react';
import { cn } from '../../lib/utils/cn';
import { Loader2 } from 'lucide-react';

export interface LoadingIndicatorProps
  extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  size = 'md',
  label = 'Loading...',
  className,
  ...props
}) => {
  const pixelSize = size === 'sm' ? 16 : size === 'lg' ? 32 : 24;

  return (
    <div
      role="status"
      aria-label={label}
      className={cn('inline-flex items-center justify-center text-teal-trust', className)}
      {...props}
    >
      <Loader2
        size={pixelSize}
        className="animate-spin shrink-0"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
};

