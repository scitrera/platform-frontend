import {clsx, type ClassValue} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

export function generateId(prefix: string = 'id'): string {
    return `${prefix}_${Math.random().toString(36).substring(2, 11)}`;
}

// Safe UUID v4 generator — crypto.randomUUID() is unavailable in non-secure
// contexts (e.g. HTTP dev servers), so fall back to a Math.random polyfill.
export function generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
}

export function titleCase(value: string | null | undefined): string {
    if (!value || typeof value !== 'string') {
        return value as string;
    }
    return value
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export type DateTimeFormatStyle = 'full' | 'long' | 'medium' | 'short';

// TODO: locale should actually be adaptive rather than assume en-US
export function timestampToString(
    timestamp: number | Date | null | undefined,
    locale: string = 'en-US',
    dateStyle: DateTimeFormatStyle = 'short',
    timeStyle: DateTimeFormatStyle = 'short',
): string {
    if (!timestamp) return '';
    // Handle Unix seconds (backend sends float seconds, JS Date expects milliseconds)
    const ms = typeof timestamp === 'number' && timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const date = new Date(ms as number | Date);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale, {dateStyle, timeStyle}).format(date);
}

// Helper to format byte sizes
export function formatFileSize(bytes: number | null | undefined): string {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
}

export function sessionStorageStateInit<T = unknown>(
    key: string,
    fallback: T | null = null,
): () => T | null {
    return () => {
        if (key) {
            const stored = sessionStorage.getItem(key);
            if (stored) {
                try {
                    return JSON.parse(stored) as T;
                } catch {
                    sessionStorage.removeItem(key);
                }
            }
        }
        if (fallback) {
            sessionStorage.setItem(key, JSON.stringify(fallback));
        }
        return fallback;
    };
}
