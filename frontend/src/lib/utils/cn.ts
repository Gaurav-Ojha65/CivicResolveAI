/**
 * Lightweight class names merging utility.
 * Joins truthy string class arguments with single spaces.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

