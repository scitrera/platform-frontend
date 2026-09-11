/**
 * Shared building blocks for the MemoryLayer admin sections.
 *
 * MemoryLayer's admin list endpoints (sessions / jobs / memories) all return
 * the same ``{items, total, limit, offset}`` envelope, so a single
 * server-paginated table factory drives all three. Overview and Audit have
 * bespoke shapes and live in their own components.
 */
import {
    useCallback, useContext, useEffect, useMemo, useRef, useState,
    type ReactNode,
} from 'react';
import {X} from 'lucide-react';
import {WebSocketContext} from '@/contexts/WebSocketContext';
import {adminRpc} from '@/utils/adminRpc';
import {EmptyState} from '../_shared/EmptyState';
import {Pagination} from '../_shared/Pagination';
import {useAdminQueryState, useAdminHashState} from '../_shared/useAdminUrlState';
import {sortIndicator, useSortableRows, type SortDir} from '../_shared/useSortableRows';
import type {MLPaginated} from '../types';

const POLL_MS = 30_000;
const FILTER_DEBOUNCE_MS = 300;
const PAGE_SIZE_OPTIONS = [50, 100, 200];
const DEFAULT_LIMIT = 100;
// Sentinel written to the URL when the user explicitly picks the blank option
// of a *defaulted* select (e.g. "All statuses" on Memories). An empty string
// gets pruned from the URL, which would let the default (status=active)
// reassert — so we store this instead and map it back to "no filter".
const ALL_SENTINEL = '__all__';

/**
 * Parse an ISO-8601 timestamp to epoch milliseconds for ``<TimeAgo>``. Returns
 * 0 (rendered as "—") for null/blank/unparseable input. MemoryLayer emits ISO
 * strings whereas Aether admin emits epoch seconds — this bridges the gap.
 */
export function isoTs(s: string | null | undefined): number {
    if (!s) return 0;
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? 0 : ms;
}

/** Human-readable byte size (1024-based). */
export function formatBytes(n: number | null | undefined): string {
    if (n == null || Number.isNaN(n)) return '—';
    if (n === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const val = n / Math.pow(1024, i);
    return `${val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

/** Truncate long free-text (e.g. memory content) for a table cell. */
export function truncate(s: string | null | undefined, max = 140): string {
    if (!s) return '—';
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

// Status → Tailwind classes. Covers job statuses (queued/running/completed/
// failed/cancelled), memory statuses (active/archived), and health statuses
// (healthy/connected/degraded/unhealthy/error/...). Unknown → neutral gray.
const STATUS_CLASSES: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    active: 'bg-green-100 text-green-800',
    healthy: 'bg-green-100 text-green-800',
    connected: 'bg-green-100 text-green-800',
    running: 'bg-blue-100 text-blue-800',
    queued: 'bg-amber-100 text-amber-800',
    degraded: 'bg-amber-100 text-amber-800',
    archived: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-gray-100 text-gray-600',
    not_configured: 'bg-gray-100 text-gray-600',
    disconnected: 'bg-gray-100 text-gray-600',
    failed: 'bg-red-100 text-red-800',
    unhealthy: 'bg-red-100 text-red-800',
    error: 'bg-red-100 text-red-800',
};

export function StatusBadge({status}: {status: string}) {
    const cls = STATUS_CLASSES[status?.toLowerCase()] || 'bg-gray-100 text-gray-600';
    return (
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
            {status || '—'}
        </span>
    );
}

export interface ColumnDef<T> {
    key: string;
    label: string;
    render?: (row: T) => ReactNode;
    mono?: boolean;
    className?: string;
}

export interface FilterDef {
    key: string;
    label: string;
    type: 'text' | 'select';
    options?: string[];
    /** Tailwind width class (default w-40). */
    width?: string;
}

export interface PagedSectionConfig<T> {
    title: string;
    /** Admin RPC op returning an ``MLPaginated<T>`` envelope. */
    op: string;
    columns: ColumnDef<T>[];
    filters?: FilterDef[];
    rowKey: (row: T) => string;
    emptyTitle?: string;
    emptyDescription?: string;
    /** Filter values applied when the URL has no value for that key. */
    defaultFilters?: Record<string, string>;
    /** Column keys the user can sort the current page by (client-side). */
    sortableKeys?: string[];
    /** Initial sort applied when no ?sort is in the URL. */
    defaultSort?: {key: string; dir: SortDir};
    /**
     * Enables a per-row detail drawer. Clicking a row writes ``rowKey(row)`` to
     * the ``hashKey`` URL hash param and opens a slide-over that fetches the
     * full row via the ``op`` admin RPC (called with ``{id}``).
     */
    detail?: {
        /** URL hash key holding the selected row id (e.g. "chat"). */
        hashKey: string;
        /** Admin RPC op returning the full row object for ``{id}``. */
        op: string;
        /** Drawer heading. */
        title: string;
    };
}

/** One label/value row in a detail drawer. Objects/arrays render as JSON. */
function DrawerField({label, value}: {label: string; value: unknown}) {
    const isObj = value !== null && typeof value === 'object';
    const blank = value === null || value === undefined || value === '';
    return (
        <div className="py-2 border-b border-gray-100">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
            {isObj ? (
                <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-x-auto max-h-64">
                    {JSON.stringify(value, null, 2)}
                </pre>
            ) : (
                <div className="text-sm break-words">{blank ? '—' : String(value)}</div>
            )}
        </div>
    );
}

/**
 * Slide-over that fetches a single admin row via ``op({id})`` and renders its
 * fields. Read-only; shared by all MemoryLayer catalog sections.
 */
export function MemoryLayerDetailDrawer(
    {op, id, title, onClose}: {op: string; id: string; title: string; onClose: () => void},
) {
    const ws = useContext(WebSocketContext);
    const sendRpcRequest = ws?.sendRpcRequest;
    const [data, setData] = useState<Record<string, unknown> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        if (!sendRpcRequest) return;
        setLoading(true);
        setError(null);
        adminRpc<Record<string, unknown>>(sendRpcRequest, op, {id})
            .then(d => {
                if (!cancelled) setData(d);
            })
            .catch(e => {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [sendRpcRequest, op, id]);

    return (
        <div className="fixed inset-0 z-50 flex" onClick={onClose}>
            <div className="flex-1 bg-black/30"/>
            <aside
                className="w-[480px] bg-white shadow-xl overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
                    <h3 className="text-base font-semibold">{title}</h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
                        <X size={18}/>
                    </button>
                </div>
                <div className="p-4">
                    {loading && <div className="text-sm text-gray-500">Loading…</div>}
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            {error}
                        </div>
                    )}
                    {!loading && !error && data && (
                        <div className="font-mono text-xs mb-2 text-gray-400 break-all">{id}</div>
                    )}
                    {!loading && !error && data &&
                        Object.entries(data).map(([k, v]) => (
                            <DrawerField key={k} label={k} value={v}/>
                        ))}
                </div>
            </aside>
        </div>
    );
}

/**
 * Build a server-paginated admin table section from a declarative config.
 * URL query params (``limit``/``offset`` + one per filter) are the source of
 * truth, mirroring the other admin sections. Text filters are debounced;
 * selects apply eagerly.
 */
export function makePagedListSection<T>(config: PagedSectionConfig<T>): () => ReactNode {
    const {title, op, columns, filters = [], rowKey} = config;
    const textFilterKeys = filters.filter(f => f.type === 'text').map(f => f.key);
    const sortableKeys = new Set(config.sortableKeys || []);

    return function PagedListSection() {
        const ws = useContext(WebSocketContext);
        const sendRpcRequest = ws?.sendRpcRequest;
        const {query, setQuery} = useAdminQueryState();
        const {hash, setHash} = useAdminHashState();

        // Per-row detail drawer: the selected row id lives in the URL hash so a
        // deep link / refresh reopens it. Only active when config.detail is set.
        const detail = config.detail;
        const openId = detail ? (hash[detail.hashKey] || null) : null;
        const openRow = detail
            ? (id: string) => setHash({[detail.hashKey]: id})
            : undefined;
        const closeRow = detail
            ? () => setHash({[detail.hashKey]: ''})
            : undefined;

        const limit = Math.min(
            500,
            Math.max(10, parseInt(query.limit || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
        );
        const offset = Math.max(0, parseInt(query.offset || '0', 10) || 0);

        // Stable key over all active filter values — used to memoize the args
        // object so ``refresh`` doesn't depend on the ever-changing ``query``.
        const filterKey = filters.map(f => query[f.key] ?? '').join('');
        // Effective filter value = explicit URL value, else the section default
        // (e.g. status=active for Memories). The ALL_SENTINEL maps back to "no
        // filter" so a defaulted select can still be cleared to show all.
        const effective = (key: string) => {
            const raw = query[key];
            if (raw === ALL_SENTINEL) return '';
            if (raw != null) return raw;
            return config.defaultFilters?.[key] ?? '';
        };
        const activeFilters = useMemo(() => {
            const out: Record<string, string> = {};
            for (const f of filters) {
                const v = effective(f.key);
                if (v) out[f.key] = v;
            }
            return out;
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [filterKey]);

        // Local mirrors for debounced text inputs, resynced when the URL changes
        // externally (popstate / sidebar nav clearing the query string).
        const [localText, setLocalText] = useState<Record<string, string>>(() => {
            const o: Record<string, string> = {};
            for (const k of textFilterKeys) o[k] = query[k] ?? '';
            return o;
        });
        const textUrlKey = textFilterKeys.map(k => query[k] ?? '').join('');
        useEffect(() => {
            setLocalText(() => {
                const o: Record<string, string> = {};
                for (const k of textFilterKeys) o[k] = query[k] ?? '';
                return o;
            });
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [textUrlKey]);

        const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
        useEffect(() => {
            const changed = textFilterKeys.some(k => (localText[k] ?? '') !== (query[k] ?? ''));
            if (!changed) return;
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            debounceTimer.current = setTimeout(() => {
                const patch: Record<string, string> = {offset: '0'};
                for (const k of textFilterKeys) patch[k] = localText[k] ?? '';
                setQuery(patch);
            }, FILTER_DEBOUNCE_MS);
            return () => {
                if (debounceTimer.current) clearTimeout(debounceTimer.current);
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [localText, textUrlKey, setQuery]);

        const [rows, setRows] = useState<T[]>([]);
        const [total, setTotal] = useState(0);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState<string | null>(null);

        const refresh = useCallback(async () => {
            if (!sendRpcRequest) return;
            setLoading(true);
            setError(null);
            try {
                const args: Record<string, unknown> = {limit, offset, ...activeFilters};
                const data = await adminRpc<MLPaginated<T>>(sendRpcRequest, op, args);
                setRows(data.items || []);
                setTotal(typeof data.total === 'number' ? data.total : (data.items?.length || 0));
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            } finally {
                setLoading(false);
            }
        }, [sendRpcRequest, limit, offset, activeFilters]);

        useEffect(() => {
            refresh();
            const t = setInterval(refresh, POLL_MS);
            return () => clearInterval(t);
        }, [refresh]);

        const currentPage = Math.floor(offset / limit) + 1;
        const setOffset = (next: number) => setQuery({offset: String(Math.max(0, next))});
        const setLimit = (next: number) => setQuery({limit: String(next), offset: '0'});

        // Client-side sort of the current page (server returns one page at a
        // time; MemoryLayer's admin list endpoints don't take a sort param).
        const {sortedRows, sortKey, sortDir, toggleSort} = useSortableRows<T>(
            rows, config.defaultSort?.key ?? '', config.defaultSort?.dir ?? 'asc',
        );

        return (
            <div className="flex flex-col h-full p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                            {loading ? 'Loading…' : `${total} item(s)`}
                        </span>
                        <button
                            onClick={refresh}
                            disabled={loading}
                            className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 text-sm"
                        >
                            {loading ? 'Loading…' : 'Refresh'}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                    {filters.map(f => f.type === 'text' ? (
                        <input
                            key={f.key}
                            placeholder={f.label}
                            value={localText[f.key] ?? ''}
                            onChange={e => setLocalText(prev => ({...prev, [f.key]: e.target.value}))}
                            className={`px-2 py-1 border rounded text-sm ${f.width || 'w-40'}`}
                        />
                    ) : (
                        <select
                            key={f.key}
                            value={query[f.key] ?? config.defaultFilters?.[f.key] ?? ''}
                            onChange={e => setQuery({[f.key]: e.target.value, offset: '0'})}
                            className={`px-2 py-1 border rounded text-sm ${f.width || 'w-40'}`}
                        >
                            <option value={config.defaultFilters?.[f.key] != null ? ALL_SENTINEL : ''}>
                                {f.label}
                            </option>
                            {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    ))}
                    <select
                        value={String(limit)}
                        onChange={e => setLimit(parseInt(e.target.value, 10))}
                        className="ml-auto px-2 py-1 border rounded text-sm w-24"
                        title="Page size"
                    >
                        {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}/page</option>)}
                    </select>
                </div>

                {error && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-auto border rounded bg-white">
                    {rows.length === 0 && !loading && (
                        <EmptyState
                            title={config.emptyTitle || 'No results'}
                            description={config.emptyDescription}
                        />
                    )}
                    {rows.length > 0 && (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600 sticky top-0">
                                <tr>
                                    {columns.map(c => {
                                        const canSort = sortableKeys.has(c.key);
                                        return (
                                            <th
                                                key={c.key}
                                                className={`px-3 py-2 text-left ${canSort ? 'cursor-pointer select-none hover:bg-gray-100' : ''}`}
                                                onClick={canSort ? () => toggleSort(c.key) : undefined}
                                                title={canSort ? 'Click to sort this page' : undefined}
                                            >
                                                {c.label}{canSort ? sortIndicator(sortKey === c.key, sortDir) : ''}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRows.map(row => (
                                    <tr
                                        key={rowKey(row)}
                                        onClick={openRow ? () => openRow(rowKey(row)) : undefined}
                                        className={`border-t hover:bg-blue-50 ${openRow ? 'cursor-pointer' : ''}`}
                                    >
                                        {columns.map(c => (
                                            <td
                                                key={c.key}
                                                className={`px-3 py-2 ${c.mono ? 'font-mono text-xs break-all' : ''} ${c.className || ''}`}
                                            >
                                                {c.render
                                                    ? c.render(row)
                                                    : String((row as Record<string, unknown>)[c.key] ?? '—')}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="mt-3">
                    <Pagination
                        page={currentPage}
                        pageSize={limit}
                        total={total}
                        onPageChange={(next) => setOffset((next - 1) * limit)}
                    />
                </div>

                {detail && openId && closeRow && (
                    <MemoryLayerDetailDrawer
                        op={detail.op}
                        id={openId}
                        title={detail.title}
                        onClose={closeRow}
                    />
                )}
            </div>
        );
    };
}
