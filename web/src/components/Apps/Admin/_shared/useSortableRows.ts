/**
 * Generic sortable-rows hook for admin tables.
 *
 * Returns a sorted view of `rows`, current sort key/direction, and a toggle
 * function for column-header clicks. Sort state is URL-synced via
 * useAdminQueryState (?sort=col&dir=asc) so deep-linking matches the rest of
 * the admin URL state pattern.
 */
import {useCallback, useMemo} from 'react';
import {useAdminQueryState} from './useAdminUrlState';

export type SortDir = 'asc' | 'desc';

type Comparable = string | number | boolean | null | undefined;

function compare(a: Comparable, b: Comparable): number {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'string' && typeof b === 'string') {
        return a.localeCompare(b);
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') {
        return a === b ? 0 : a ? 1 : -1;
    }
    return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
}

export interface SortableRows<T> {
    sortedRows: T[];
    sortKey: string;
    sortDir: SortDir;
    toggleSort: (key: string) => void;
}

export function useSortableRows<T>(
    rows: T[],
    defaultKey: string = '',
    defaultDir: SortDir = 'asc',
): SortableRows<T> {
    const {query, setQuery} = useAdminQueryState();
    const sortKey = query.sort || defaultKey;
    // Honor an explicit URL value first; fall back to the caller-supplied
    // defaultDir when no direction is in the URL. The previous version
    // ignored defaultDir for the initial state and always fell through to
    // 'asc', which silently broke any caller that wanted 'desc' by default.
    const sortDir: SortDir = query.dir === 'desc'
        ? 'desc'
        : query.dir === 'asc'
            ? 'asc'
            : defaultDir;

    const toggleSort = useCallback((key: string) => {
        if (sortKey === key) {
            setQuery({sort: key, dir: sortDir === 'asc' ? 'desc' : 'asc'});
        } else {
            setQuery({sort: key, dir: defaultDir});
        }
    }, [sortKey, sortDir, defaultDir, setQuery]);

    const sortedRows = useMemo(() => {
        if (!sortKey) return rows;
        // Use a decorated sort to keep it stable across re-renders.
        const decorated = rows.map((r, i) => ({r, i}));
        decorated.sort((x, y) => {
            const a = (x.r as Record<string, unknown>)[sortKey] as Comparable;
            const b = (y.r as Record<string, unknown>)[sortKey] as Comparable;
            const cmp = compare(a, b);
            if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
            return x.i - y.i;
        });
        return decorated.map(d => d.r);
    }, [rows, sortKey, sortDir]);

    return {sortedRows, sortKey, sortDir, toggleSort};
}

/** Small helper for header cells: returns the active arrow indicator or empty. */
export function sortIndicator(active: boolean, dir: SortDir): string {
    if (!active) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
}
