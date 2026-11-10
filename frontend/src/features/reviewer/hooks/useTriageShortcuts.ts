import { useEffect, useCallback } from 'react';

interface TriageShortcutsOptions {
  onNext?: () => void;
  onPrevious?: () => void;
  onSelectApprove?: () => void;
  onSelectOverride?: () => void;
  onSelectReject?: () => void;
  onToggleHelp?: () => void;
  enabled?: boolean;
}

export function useTriageShortcuts({
  onNext,
  onPrevious,
  onSelectApprove,
  onSelectOverride,
  onSelectReject,
  onToggleHelp,
  enabled = true,
}: TriageShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Guard: do not trigger when typing inside inputs, textareas, selects
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Modifier key guards: do not interfere with Ctrl+C, Cmd+R, etc.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const key = e.key.toUpperCase();

      switch (key) {
        case 'J':
        case ']':
          e.preventDefault();
          onNext?.();
          break;
        case 'K':
        case '[':
          e.preventDefault();
          onPrevious?.();
          break;
        case 'A':
          e.preventDefault();
          onSelectApprove?.();
          break;
        case 'O':
          e.preventDefault();
          onSelectOverride?.();
          break;
        case 'R':
          e.preventDefault();
          onSelectReject?.();
          break;
        case '?':
          e.preventDefault();
          onToggleHelp?.();
          break;
        default:
          break;
      }
    },
    [
      enabled,
      onNext,
      onPrevious,
      onSelectApprove,
      onSelectOverride,
      onSelectReject,
      onToggleHelp,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
