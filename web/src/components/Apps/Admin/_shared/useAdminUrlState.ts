/**
 * URL-state hooks for admin sections.
 *
 * Reads/writes the active app's appQueryParams and appHash through the
 * shared appPanelStore so the URL remains the source of truth. Hash writes
 * use replaceState semantics (no history entry per drawer toggle).
 */
import {useCallback} from 'react';
import {useAppPanelStore} from '@/stores/appPanelStore';

type QueryRecord = Record<string, string>;

function paramsToRecord(qp: URLSearchParams | Record<string, string> | null): QueryRecord {
    if (!qp) return {};
    if (qp instanceof URLSearchParams) return Object.fromEntries(qp);
    return {...qp};
}

/** Strip empty-string entries so the URL stays clean. */
function pruneEmpty(rec: QueryRecord): QueryRecord {
    const out: QueryRecord = {};
    for (const [k, v] of Object.entries(rec)) {
        if (v !== '' && v != null) out[k] = v;
    }
    return out;
}

export function useAdminQueryState(): {
    query: QueryRecord;
    setQuery: (patch: QueryRecord) => void;
} {
    const raw = useAppPanelStore(s => s.appQueryParams);
    const updateAppUrl = useAppPanelStore(s => s.updateAppUrl);

    const query = paramsToRecord(raw);

    const setQuery = useCallback((patch: QueryRecord) => {
        const current = paramsToRecord(useAppPanelStore.getState().appQueryParams);
        const merged = pruneEmpty({...current, ...patch});
        updateAppUrl({query: Object.keys(merged).length === 0 ? null : merged});
    }, [updateAppUrl]);

    return {query, setQuery};
}

/**
 * Parse a hash like "#k1=v1&k2=v2" or "#k1" into a record. Bare keys (no `=`)
 * resolve to the empty string. The leading `#` is optional.
 */
export function parseHash(hash: string | null): QueryRecord {
    if (!hash) return {};
    const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!trimmed) return {};
    const out: QueryRecord = {};
    for (const part of trimmed.split('&')) {
        const eq = part.indexOf('=');
        if (eq < 0) {
            out[decodeURIComponent(part)] = '';
        } else {
            const k = decodeURIComponent(part.slice(0, eq));
            const v = decodeURIComponent(part.slice(eq + 1));
            out[k] = v;
        }
    }
    return out;
}

function recordToHash(rec: QueryRecord): string | null {
    const entries = Object.entries(pruneEmpty(rec));
    if (entries.length === 0) return null;
    return '#' + entries
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

export function useAdminHashState(): {
    hash: QueryRecord;
    setHash: (patch: QueryRecord) => void;
} {
    const raw = useAppPanelStore(s => s.appHash);
    const updateAppUrl = useAppPanelStore(s => s.updateAppUrl);

    const hash = parseHash(raw);

    const setHash = useCallback((patch: QueryRecord) => {
        const current = parseHash(useAppPanelStore.getState().appHash);
        const next = recordToHash({...current, ...patch});
        updateAppUrl({hash: next, replace: true});
    }, [updateAppUrl]);

    return {hash, setHash};
}
