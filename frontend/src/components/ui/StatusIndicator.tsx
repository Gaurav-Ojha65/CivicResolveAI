import React from 'react';
import { cn } from '../../lib/utils/cn';
import { GrievanceStatus, TriagePriority } from '../../types/grievance';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Edit3,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';

export interface StatusIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: GrievanceStatus;
  priority?: TriagePriority;
  label?: string;
  size?: 'sm' | 'md';
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  priority,
  label: customLabel,
  size = 'md',
  className,
  ...props
}) => {
  // Mode 1: GrievanceStatus
  if (status) {
    const config = getStatusConfig(status);
    const label = customLabel || config.label;
    const Icon = config.icon;

    return (
      <span
        className={cn(
          'inline-flex items-center font-medium border rounded-md tabular-nums select-none',
          config.classes,
          size === 'sm' ? 'px-2 py-0.5 text-[11px] gap-1' : 'px-2.5 py-1 text-xs gap-1.5',
          className
        )}
        {...props}
      >
        <Icon
          size={size === 'sm' ? 12 : 14}
          className="shrink-0"
          aria-hidden="true"
        />
        <span>{label}</span>
      </span>
    );
  }

  // Mode 2: TriagePriority
  if (priority) {
    const config = getPriorityConfig(priority);
    const label = customLabel || config.label;
    const Icon = config.icon;

    return (
      <span
        className={cn(
          'inline-flex items-center font-medium border rounded-md tabular-nums select-none',
          config.classes,
          size === 'sm' ? 'px-2 py-0.5 text-[11px] gap-1' : 'px-2.5 py-1 text-xs gap-1.5',
          className
        )}
        {...props}
      >
        <Icon
          size={size === 'sm' ? 12 : 14}
          className="shrink-0"
          aria-hidden="true"
        />
        <span>{label}</span>
      </span>
    );
  }

  // Fallback neutral
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium border border-border bg-canvas text-ink-muted rounded-md',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className
      )}
      {...props}
    >
      <span>{customLabel || 'Unknown'}</span>
    </span>
  );
};

function getStatusConfig(status: GrievanceStatus) {
  switch (status) {
    case 'PENDING_REVIEW':
      return {
        label: 'Pending Review',
        classes:
          'bg-semantic-warning-bg text-semantic-warning-fg border-semantic-warning-border',
        icon: Clock,
      };
    case 'AUTO_ROUTED':
      return {
        label: 'Auto-Routed',
        classes:
          'bg-semantic-info-bg text-semantic-info-fg border-semantic-info-border',
        icon: Sparkles,
      };
    case 'APPROVED':
      return {
        label: 'Approved',
        classes:
          'bg-semantic-success-bg text-semantic-success-fg border-semantic-success-border',
        icon: CheckCircle2,
      };
    case 'OVERRIDDEN':
      return {
        label: 'Overridden',
        classes:
          'bg-[#F5F3FF] text-[#6D28D9] border-[#DDD6FE]',
        icon: Edit3,
      };
    case 'REJECTED':
      return {
        label: 'Rejected',
        classes:
          'bg-semantic-danger-bg text-semantic-danger-fg border-semantic-danger-border',
        icon: XCircle,
      };
    default:
      return {
        label: String(status),
        classes: 'bg-canvas text-ink-muted border-border',
        icon: Clock,
      };
  }
}

function getPriorityConfig(priority: TriagePriority) {
  switch (priority) {
    case 'CRITICAL':
      return {
        label: 'Critical Priority',
        classes:
          'bg-semantic-danger-bg text-semantic-danger-fg border-semantic-danger-border font-semibold',
        icon: AlertTriangle,
      };
    case 'HIGH':
      return {
        label: 'High Priority',
        classes:
          'bg-semantic-warning-bg text-semantic-warning-fg border-semantic-warning-border font-medium',
        icon: ArrowUp,
      };
    case 'MEDIUM':
      return {
        label: 'Medium Priority',
        classes:
          'bg-semantic-info-bg text-semantic-info-fg border-semantic-info-border',
        icon: Minus,
      };
    case 'LOW':
      return {
        label: 'Low Priority',
        classes:
          'bg-canvas text-ink-muted border-border',
        icon: ArrowDown,
      };
    default:
      return {
        label: String(priority),
        classes: 'bg-canvas text-ink-muted border-border',
        icon: Minus,
      };
  }
}

