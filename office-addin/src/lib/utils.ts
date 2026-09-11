import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes safely — same helper as frontend/src/lib/utils.jsx */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Generate a short random id with an optional prefix. */
export function generateId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Safe UUID v4 — crypto.randomUUID() is unavailable in non-secure contexts
 * (HTTP dev servers), so fall back to a Math.random polyfill.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Format a Unix-seconds timestamp to a locale string. */
export function timestampToString(timestamp: number): string {
  if (!timestamp) return '';
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const date = new Date(ms);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
