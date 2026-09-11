import {useCallback, useContext, useEffect, useRef, useState} from 'react';
import {WebSocketContext} from '@/contexts/WebSocketContext';
import {adminRpc} from '@/utils/adminRpc';
import {EmptyState} from '../_shared/EmptyState';
import {TimeAgo} from '../_shared/TimeAgo';
import {useAdminQueryState} from '../_shared/useAdminUrlState';
import {isoTs} from './MemoryLayerShared';
import type {MLAuditEvent, MLAuditResult} from '../types';

const POLL_MS = 30_000;
const FILTER_DEBOUNCE_MS = 300;
const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];
const DEFAULT_LIMIT = 100;

type RangeKey = 'last_1h' | 'last_24h' | 'last_7d' | 'last_30d' | 'all';

const RANGE_OPTIONS: {value: RangeKey; label: string; seconds: number | null}[] = [
    {value: 'last_1h', label: '1 hour', seconds: 60 * 60},
    {value: 'last_24h', label: '24 hours', seconds: 24 * 60 * 60},
    {value: 'last_7d', label: '7 days', seconds: 7 * 24 * 60 * 60},
    {value: 'last_30d', label: '30 days', seconds: 30 * 24 * 60 * 60},
    {value: 'all', label: 'All time', seconds: null},
];

/** ISO lower-bound for the selected range, or undefined for "all". */
function rangeSince(range: RangeKey): string | undefined {
    const opt = RANGE_OPTIONS.find(o => o.value === range);
    if (!opt || opt.seconds === null) return undefined;
    return new Date(Date.now() - opt.seconds * 1000).toISOString();
}

/**
 * MemoryLayer audit events (memorylayer.audit). This endpoint returns
 * ``{events, count}`` and pages by ``limit`` + ``since`` (no offset), so it's a
 * single-page view rather than the offset-paginated table used elsewhere.
 */
export function MemoryLayerAuditSection() {
    const ws = useContext(WebSocketContext);
    const sendRpcRequest = ws?.sendRpcRequest;
    const {query, setQuery} = useAdminQueryState();

    const range = (query.range as RangeKey) || 'last_24h';
    const urlWorkspace = query.workspace_id ?? '';
    const urlEventType = query.event_type ?? '';
    const limit = Math.min(
        1000,
        Math.max(10, parseInt(query.limit || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );

    const [localWorkspace, setLocalWorkspace] = useState(urlWorkspace);
    const [localEventType, setLocalEventType] = useState(urlEventType);
    useEffect(() => { setLocalWorkspace(urlWorkspace); }, [urlWorkspace]);
    useEffect(() => { setLocalEventType(urlEventType); }, [urlEventType]);

    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (localWorkspace === urlWorkspace && localEventType === urlEventType) return;
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            setQuery({workspace_id: localWorkspace, event_type: localEventType});
        }, FILTER_DEBOUNCE_MS);
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [localWorkspace, localEventType, urlWorkspace, urlEventType, setQuery]);

    const [events, setEvents] = useState<MLAuditEvent[]>([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!sendRpcRequest) return;
        setLoading(true);
        setError(null);
        try {
            const args: Record<string, unknown> = {limit};
            if (urlWorkspace) args.workspace_id = urlWorkspace;
            if (urlEventType) args.event_type = urlEventType;
            const since = rangeSince(range);
            if (since) args.since = since;
            const data = await adminRpc<MLAuditResult>(sendRpcRequest, 'memorylayer.audit', args);
            setEvents(data.events || []);
            setCount(typeof data.count === 'number' ? data.count : (data.events?.length || 0));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [sendRpcRequest, limit, range, urlWorkspace, urlEventType]);

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, POLL_MS);
        return () => clearInterval(t);
    }, [refresh]);

    return (
        <div className="flex flex-col h-full p-4">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">MemoryLayer Audit</h2>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                        {loading ? 'Loading…' : `${count} event(s)`}
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
                <select
                    value={range}
                    onChange={e => setQuery({range: e.target.value})}
                    className="px-2 py-1 border rounded text-sm w-32"
                >
                    {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                    placeholder="Filter workspace"
                    value={localWorkspace}
                    onChange={e => setLocalWorkspace(e.target.value)}
                    className="px-2 py-1 border rounded text-sm w-44"
                />
                <input
                    placeholder="Event type"
                    value={localEventType}
                    onChange={e => setLocalEventType(e.target.value)}
                    className="px-2 py-1 border rounded text-sm w-44"
                />
                <select
                    value={String(limit)}
                    onChange={e => setQuery({limit: e.target.value})}
                    className="ml-auto px-2 py-1 border rounded text-sm w-24"
                    title="Max events"
                >
                    {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} max</option>)}
                </select>
            </div>

            {error && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto border rounded bg-white">
                {events.length === 0 && !loading && (
                    <EmptyState
                        title="No audit events"
                        description="No MemoryLayer audit events match the current filters. Try widening the time range."
                    />
                )}
                {events.length > 0 && (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600 sticky top-0">
                            <tr>
                                <th className="px-3 py-2 text-left">When</th>
                                <th className="px-3 py-2 text-left">Event</th>
                                <th className="px-3 py-2 text-left">Action</th>
                                <th className="px-3 py-2 text-left">Workspace</th>
                                <th className="px-3 py-2 text-left">User</th>
                                <th className="px-3 py-2 text-left">Resource</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map(ev => (
                                <tr key={ev.id} className="border-t hover:bg-blue-50">
                                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                                        <TimeAgo ts={isoTs(ev.timestamp)}/>
                                    </td>
                                    <td className="px-3 py-2">{ev.event_type || '—'}</td>
                                    <td className="px-3 py-2">{ev.action || '—'}</td>
                                    <td className="px-3 py-2">{ev.workspace_id || '—'}</td>
                                    <td className="px-3 py-2 font-mono text-xs break-all">{ev.user_id || '—'}</td>
                                    <td className="px-3 py-2 font-mono text-xs break-all">
                                        {ev.resource_type || ev.resource_id
                                            ? `${ev.resource_type || ''}/${ev.resource_id || ''}`
                                            : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
