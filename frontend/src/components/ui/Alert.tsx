import React from 'react';
import { cn } from '../../lib/utils/cn';
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  LucideIcon,
} from 'lucide-react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  onClose?: () => void;
}

interface VariantConfigItem {
  classes: string;
  iconClasses: string;
  icon: LucideIcon;
}

const variantConfig: Record<AlertVariant, VariantConfigItem> = {
  info: {
    classes:
      'bg-semantic-info-bg text-semantic-info-fg border-semantic-info-border',
    iconClasses: 'text-semantic-info-fg',
    icon: Info,
  },
  success: {
    classes:
      'bg-semantic-success-bg text-semantic-success-fg border-semantic-success-border',
    iconClasses: 'text-semantic-success-fg',
    icon: CheckCircle2,
  },
  warning: {
    classes:
      'bg-semantic-warning-bg text-semantic-warning-fg border-semantic-warning-border',
    iconClasses: 'text-semantic-warning-fg',
    icon: AlertTriangle,
  },
  danger: {
    classes:
      'bg-semantic-danger-bg text-semantic-danger-fg border-semantic-danger-border',
    iconClasses: 'text-semantic-danger-fg',
    icon: AlertCircle,
  },
};

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  onClose,
  className,
  ...props
}) => {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div
      role="alert"
      className={cn(
        'relative flex items-start gap-3 p-4 rounded-xl border text-sm',
        config.classes,
        className
      )}
      {...props}
    >
      <Icon
        size={18}
        className={cn('shrink-0 mt-0.5', config.iconClasses)}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        {title && <h4 className="font-semibold mb-0.5 tracking-tight">{title}</h4>}
        <div className="text-xs leading-relaxed opacity-95">{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss alert"
          className={cn(
            'shrink-0 p-1 rounded-md transition-colors -mr-1 -mt-1',
            'hover:bg-black/5 active:bg-black/10',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus'
          )}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
