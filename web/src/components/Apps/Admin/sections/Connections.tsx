import {useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {useAuthStore} from '@/stores/authStore';
import {WebSocketContext} from '@/contexts/WebSocketContext';
import {adminRpc} from '@/utils/adminRpc';
import {EmptyState} from '../_shared/EmptyState';
import {TimeAgo} from '../_shared/TimeAgo';
import {AgentBadge, UserBadge, parseUserIdentity} from '../_shared/IdentityBadge';
import {Pagination} from '../_shared/Pagination';
import {useSortableRows, sortIndicator} from '../_shared/useSortableRows';
import {useAdminQueryState} from '../_shared/useAdminUrlState';
import type {ConnectionRow} from '../types';

const POLL_MS = 30_000;
const FILTER_DEBOUNCE_MS = 300;
const PAGE_SIZE_OPTIONS = [50, 100, 200];
const DEFAULT_LIMIT = 100;

type SortableColumn = keyof ConnectionRow;

const SORTABLE_COLUMNS: {key: SortableColumn; label: string; align?: 'left' | 'right'}[] = [
    {key: 'type', label: 'Type'},
    {key: 'identity', label: 'Identity'},
    {key: 'workspace', label: 'Workspace'},
    {key: 'implementation', label: 'Implementation'},
    {key: 'specifier', label: 'Specifier'},
    {key: 'connected_at', label: 'Connected'},
    {key: 'duration', label: 'Duration'},
];

/** Render the Identity column. USER badge for users (showing email), AGENT badge alone for agents. */
function IdentityCell({row}: {row: ConnectionRow}) {
    const parsed = parseUserIdentity(row.identity);
    if (row.type === 'user' || parsed) {
        const email = parsed?.email || row.specifier || row.identity;
        return (
            <span>
                <UserBadge/>
                <span>{email || '—'}</span>
            </span>
        );
    }
    if (row.type === 'agent') {
        return (
            <span>
                <AgentBadge title={row.identity}/>
            </span>
        );
    }
    return <span className="font-mono text-xs break-all">{row.identity || '—'}</span>;
}

export function ConnectionsSection() {
    const ws = useContext(WebSocketContext);
    const sendRpcRequest = ws?.sendRpcRequest;
    // Disconnect is a destructive action — gated to super admins. Tenant
    // admins can view connections (read-only) but not kick sessions.
    const canSuper = useAuthStore(s => !!s.userInfo?.permissions?.isSuperAdmin);

    const {query, setQuery} = useAdminQueryState();
    const urlPrincipalType = query.principal_type ?? '';
    const urlWorkspace = query.workspace ?? '';
    const urlImplementation = query.implementation ?? '';
    const urlIdentity = query.identity ?? '';
    const limit = Math.min(
        500,
        Math.max(10, parseInt(query.limit || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );
    const offset = Math.max(0, parseInt(query.offset || '0', 10) || 0);

    const [rows, setRows] = useState<ConnectionRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [disconnecting, setDisconnecting] = useState<string | null>(null);
    const [localWorkspace, setLocalWorkspace] = useState(urlWorkspace);
    const [localImplementation, setLocalImplementation] = useState(urlImplementation);
    const [localIdentity, setLocalIdentity] = useState(urlIdentity);
    useEffect(() => { setLocalWorkspace(urlWorkspace); }, [urlWorkspace]);
    useEffect(() => { setLocalImplementation(urlImplementation); }, [urlImplementation]);
    useEffect(() => { setLocalIdentity(urlIdentity); }, [urlIdentity]);

    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (
            localWorkspace === urlWorkspace &&
            localImplementation === urlImplementation &&
            localIdentity === urlIdentity
        ) return;
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            setQuery({
                workspace: localWorkspace,
                implementation: localImplementation,
                identity: localIdentity,
                offset: '0',
            });
        }, FILTER_DEBOUNCE_MS);
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [localWorkspace, localImplementation, localIdentity, urlWorkspace, urlImplementation, urlIdentity, setQuery]);

    const refresh = useCallback(async () => {
        if (!sendRpcRequest) return;
        setLoading(true);
        setError(null);
        try {
            // principal_type is a server-side filter; workspace too. We pass
            // them through so the gateway can prune the result set early.
            const args: Record<string, unknown> = {limit, offset};
            if (urlPrincipalType) args.principal_type = urlPrincipalType;
            // Workspace filter is applied server-side AND client-side (so the
            // user can refine without a round-trip while typing).
            if (urlWorkspace) args.workspace = urlWorkspace;
            const conns = await adminRpc<ConnectionRow[]>(sendRpcRequest, 'aether.list_connections', args);
            setRows(conns);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [sendRpcRequest, urlPrincipalType, urlWorkspace, limit, offset]);

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, POLL_MS);
        return () => clearInterval(t);
    }, [refresh]);

    const filtered = useMemo(() => {
        return rows.filter(r => {
            if (urlImplementation && !r.implementation.toLowerCase().includes(urlImplementation.toLowerCase())) return false;
            if (urlIdentity && !r.identity.toLowerCase().includes(urlIdentity.toLowerCase())) return false;
            return true;
        });
    }, [rows, urlImplementation, urlIdentity]);

    const {sortedRows, sortKey, sortDir, toggleSort} = useSortableRows<ConnectionRow>(filtered);

    const types = useMemo(() => {
        const set = new Set(rows.map(r => r.type));
        return Array.from(set).sort();
    }, [rows]);

    const setOffset = (next: number) => setQuery({offset: String(Math.max(0, next))});
    const setLimit = (next: number) => setQuery({limit: String(next), offset: '0'});
    const currentPage = Math.floor(offset / limit) + 1;
    // No total_count from list_sessions today — rely on "page is full" heuristic
    // for the Next button. See plan for the proto follow-up.
    const hasNextPage = rows.length === limit;

    const onDisconnect = async (sessionId: string, identity: string) => {
        if (!sendRpcRequest) return;
        if (!window.confirm(`Forcibly disconnect ${identity}?\n\nThis kicks the worker off Aether but does NOT cancel any associated task.`)) return;
        setDisconnecting(sessionId);
        try {
            await adminRpc(sendRpcRequest, 'aether.disconnect_session', {session_id: sessionId});
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setDisconnecting(null);
        }
    };

    return (
        <div className="flex flex-col h-full p-4">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Aether Connections</h2>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
                <select
                    value={urlPrincipalType}
                    onChange={e => setQuery({principal_type: e.target.value, offset: '0'})}
                    className="px-2 py-1 border rounded text-sm w-36"
                >
                    <option value="">All types</option>
                    {(types.length > 0 ? types : ['agent', 'task', 'user', 'orchestrator', 'service', 'workflow_engine', 'metrics_bridge', 'bridge']).map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <input
                    placeholder="Filter workspace"
                    value={localWorkspace}
                    onChange={e => setLocalWorkspace(e.target.value)}
                    className="px-2 py-1 border rounded text-sm w-40"
                />
                <input
                    placeholder="Filter implementation"
                    value={localImplementation}
                    onChange={e => setLocalImplementation(e.target.value)}
                    className="px-2 py-1 border rounded text-sm w-44"
                />
                <input
                    placeholder="Filter identity"
                    value={localIdentity}
                    onChange={e => setLocalIdentity(e.target.value)}
                    className="px-2 py-1 border rounded text-sm w-56"
                />
                <select
                    value={String(limit)}
                    onChange={e => setLimit(parseInt(e.target.value, 10))}
                    className="ml-auto px-2 py-1 border rounded text-sm w-24"
                    title="Page size"
                >
                    {PAGE_SIZE_OPTIONS.map(n => (
                        <option key={n} value={n}>{n}/page</option>
                    ))}
                </select>
            </div>

            {error && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto border rounded bg-white">
                {sortedRows.length === 0 && !loading && (
                    <EmptyState
                        title={rows.length === 0 ? 'No active connections' : 'No matches'}
                        description={rows.length === 0 ? 'No active gateway sessions.' : 'Try clearing filters.'}
                    />
                )}
                {sortedRows.length > 0 && (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                            <tr>
                                {SORTABLE_COLUMNS.map(col => (
                                    <th
                                        key={col.key}
                                        className="px-3 py-2 text-left cursor-pointer select-none hover:bg-gray-100"
                                        onClick={() => toggleSort(col.key)}
                                        title="Click to sort"
                                    >
                                        {col.label}{sortIndicator(sortKey === col.key, sortDir)}
                                    </th>
                                ))}
                                {canSuper && <th className="px-3 py-2 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.map(r => {
                                return (
                                    <tr
                                        key={r.session_id}
                                        data-session-id={r.session_id}
                                        className="border-t"
                                    >
                                        <td className="px-3 py-2">{r.type}</td>
                                        <td className="px-3 py-2"><IdentityCell row={r}/></td>
                                        <td className="px-3 py-2">{r.workspace || '—'}</td>
                                        <td className="px-3 py-2">{r.implementation || '—'}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{r.specifier || '—'}</td>
                                        <td className="px-3 py-2 text-gray-500">
                                            <TimeAgo ts={r.connected_at}/>
                                        </td>
                                        <td className="px-3 py-2 text-gray-500">{r.duration || '—'}</td>
                                        {canSuper && (
                                            <td className="px-3 py-2 text-right">
                                                <button
                                                    onClick={() => onDisconnect(r.session_id, r.identity)}
                                                    disabled={disconnecting === r.session_id}
                                                    className="px-2 py-1 rounded border bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:opacity-50 text-xs"
                                                    title="Force-disconnect this session (super-admin only)"
                                                >
                                                    {disconnecting === r.session_id ? 'Kicking…' : 'Disconnect'}
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="mt-3">
                <Pagination
                    page={currentPage}
                    pageSize={limit}
                    // No reliable total — pass a synthetic value so Pagination
                    // shows current page. Next button overridden by hasNextPage.
                    total={hasNextPage ? offset + rows.length + 1 : offset + rows.length}
                    onPageChange={(next) => setOffset((next - 1) * limit)}
                />
            </div>
        </div>
    );
}
