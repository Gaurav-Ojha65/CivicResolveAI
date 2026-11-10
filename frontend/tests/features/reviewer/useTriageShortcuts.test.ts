import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useTriageShortcuts } from '../../../src/features/reviewer/hooks/useTriageShortcuts';

describe('useTriageShortcuts', () => {
  it('triggers onNext on "J" and "]"', () => {
    const onNext = vi.fn();
    renderHook(() => useTriageShortcuts({ onNext }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    expect(onNext).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ']' }));
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it('triggers onPrevious on "K" and "["', () => {
    const onPrevious = vi.fn();
    renderHook(() => useTriageShortcuts({ onPrevious }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(onPrevious).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '[' }));
    expect(onPrevious).toHaveBeenCalledTimes(2);
  });

  it('triggers action selection shortcuts (A for approve, O for override, R for reject)', () => {
    const onSelectApprove = vi.fn();
    const onSelectOverride = vi.fn();
    const onSelectReject = vi.fn();

    renderHook(() =>
      useTriageShortcuts({
        onSelectApprove,
        onSelectOverride,
        onSelectReject,
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(onSelectApprove).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));
    expect(onSelectOverride).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    expect(onSelectReject).toHaveBeenCalledTimes(1);
  });

  it('triggers onToggleHelp on "?"', () => {
    const onToggleHelp = vi.fn();
    renderHook(() => useTriageShortcuts({ onToggleHelp }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
    expect(onToggleHelp).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger shortcuts when target is an INPUT or TEXTAREA element', () => {
    const onSelectApprove = vi.fn();
    renderHook(() => useTriageShortcuts({ onSelectApprove }));

    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
    input.dispatchEvent(event);

    expect(onSelectApprove).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('does NOT trigger when modifier keys (ctrl, meta, alt) are held', () => {
    const onSelectApprove = vi.fn();
    renderHook(() => useTriageShortcuts({ onSelectApprove }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', altKey: true }));

    expect(onSelectApprove).not.toHaveBeenCalled();
  });

  it('does NOT trigger when enabled is false', () => {
    const onNext = vi.fn();
    renderHook(() => useTriageShortcuts({ onNext, enabled: false }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    expect(onNext).not.toHaveBeenCalled();
  });
});
