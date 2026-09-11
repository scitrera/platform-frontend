import {useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {WebSocketContext} from '@/contexts/WebSocketContext';
import {adminRpc} from '@/utils/adminRpc';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {EmptyState} from '../_shared/EmptyState';
import {TimeAgo} from '../_shared/TimeAgo';
import {UserBadge, parseUserIdentity} from '../_shared/IdentityBadge';
import {useAdminHashState, useAdminQueryState} from '../_shared/useAdminUrlState';
import {AuditDetailDrawer} from './AuditDetailDrawer';
import type {AuditEntry, AuditQueryResult} from '../types';

const POLL_MS = 30_000;
const FILTER_DEBOUNCE_MS = 300;
const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];
const DEFAULT_LIMIT = 100;

const EVENT_TYPES = ['connection', 'auth', 'message', 'kv', 'task', 'admin', 'acl'];
const ACTOR_TYPES = ['agent', 'task', 'user', 'service', 'orchestrator', 'workflow_engine', 'metrics_bridge', 'bridge'];

// Default exclusions to keep the view focused on user-actionable events.
// Operators can override via the "Show system" toggle.
const DEFAULT_EXCLUDE_ACTOR_TYPES = ['WorkflowEngine', 'Orchestrator', 'MetricsBridge'];
const DEFAULT_EXCLUDE_WORKSPACES = ['_system'];

// Heuristic-grouping window: rows from the message routing triple
// (send_message ACL check + message_received + message_routed) for one envelope
// arrive within milliseconds. 2-second window is generous and avoids
// accidentally collapsing distinct messages that share an actor + topic.
const GROUP_WINDOW_SECONDS = 2;

// Help text for the Operation column. Keys come from
// oss-repo/server/internal/audit/types.go (Op* constants). Missing keys fall
// back to plain text without a tooltip.
const OPERATION_HELP: Record<string, string> = {
    // Connection
    connection_established: 'Aether session opened (worker authenticated and registered).',
    connection_closed: 'Aether session closed.',
    lock_acquired: 'Worker acquired an exclusive presence/lease lock.',
    lock_rejected: 'Worker was denied an exclusive lock (already held by another).',
    session_registered: 'Session registered in the gateway state provider.',
    // Auth
    auth_mtls_success: 'mTLS handshake succeeded; client cert validated.',
    auth_mtls_failure: 'mTLS handshake failed; cert missing/invalid/expired.',
    auth_token_validation: 'Bearer/task token validated.',
    identity_resolved: 'Principal identity resolved from credentials.',
    identity_resolve_failed: 'Could not resolve a principal identity from credentials.',
    // Message
    message_received: 'Gateway accepted an outbound message from the sender.',
    message_routed: 'Gateway forwarded the message to its target topic/session.',
    message_route_failed: 'Routing failed (target unreachable, denied, or invalid).',
    message_delivered: 'Message delivered to the target consumer.',
    send_message: 'ACL check: sender authorized to publish to the target topic.',
    // Proxy / tunnel
    proxy_http_routed: 'HTTP request routed through the gateway proxy.',
    proxy_http_failed: 'Proxy HTTP request failed.',
    proxy_http_stream_closed: 'Long-running proxy stream closed (clean fin / idle / max-bytes / cancel).',
    tunnel_opened: 'Bidirectional tunnel opened between two principals.',
    tunnel_open_failed: 'Tunnel open request failed (denied or unreachable).',
    tunnel_closed: 'Tunnel closed.',
    // KV
    kv_get: 'Read a value from the KV namespace.',
    kv_put: 'Wrote a value to the KV namespace.',
    kv_delete: 'Deleted a key from the KV namespace.',
    kv_list: 'Listed keys in a KV prefix.',
    kv_increment: 'Atomic counter increment.',
    kv_decrement: 'Atomic counter decrement.',
    kv_increment_if: 'Conditional counter increment.',
    kv_decrement_if: 'Conditional counter decrement.',
    // Task
    task_create: 'New task enqueued.',
    task_token_issue: 'Per-task auth token minted (authority-elevation primitive).',
    // Authority grants
    authority_grant_exchange: 'Subject exchanged credentials for a fresh authority grant.',
    authority_grant_derive: 'Derived a child grant from a parent grant.',
    authority_grant_get: 'Retrieved an existing authority grant.',
    authority_grant_renew: 'Renewed an authority grant.',
    authority_grant_revoke: 'Revoked an authority grant.',
    // Admin
    admin_state_query: 'Admin queried gateway state (sessions, sandboxes, etc.).',
    admin_session_disconnect: 'Admin force-disconnected a session.',
    admin_config_change: 'Admin changed gateway configuration.',
};

type RangeKey = 'last_15m' | 'last_1h' | 'last_4h' | 'last_24h' | 'last_7d' | 'all';

const RANGE_OPTIONS: {value: RangeKey; label: string; seconds: number | null}[] = [
    {value: 'last_15m', label: '15 min', seconds: 15 * 60},
    {value: 'last_1h', label: '1 hour', seconds: 60 * 60},
    {value: 'last_4h', label: '4 hours', seconds: 4 * 60 * 60},
    {value: 'last_24h', label: '24 hours', seconds: 24 * 60 * 60},
    {value: 'last_7d', label: '7 days', seconds: 7 * 24 * 60 * 60},
    {value: 'all', label: 'All time', seconds: null},
];

const RESOURCE_TYPE_HELP: Record<string, string> = {
    session: 'A gateway session (connected worker).',
    topic: 'A message-routing topic (e.g. an agent\'s inbound queue).',
    workspace: 'A tenant workspace.',
    kv_key: 'A key in the KV namespace.',
    agent: 'An agent principal.',
    task: 'A task record.',
    user: 'A user principal.',
};

const EVENT_TYPE_HELP: Record<string, string> = {
    connection: 'Connection lifecycle (connect / disconnect / lock).',
    auth: 'Authentication and identity resolution.',
    message: 'Message routing through the gateway.',
    kv: 'Key-value namespace operations.',
    task: 'Task lifecycle and authority-grant operations.',
    admin: 'Administrative actions on the gateway.',
    acl: 'Access-control decisions (authorize / deny).',
};

function rangeStartTime(range: RangeKey): number {
    const opt = RANGE_OPTIONS.find(o => o.value === range);
    if (!opt || opt.seconds === null) return 0;
    return Math.floor(Date.now() / 1000) - opt.seconds;
}

interface RenderRow {
    parent: AuditEntry;
    children: AuditEntry[];  // empty when not a group
}

/**
 * Group adjacent message-related rows from one envelope. The aether-go audit
 * stream has no correlation id today, so we cluster by (actor_id, resource_id,
 * success, ~2s window) limited to message-routing ops. The send_message ACL
 * check + message_received + message_routed rows for one envelope share these
 * keys and arrive within milliseconds.
 */
function buildGroupedRows(entries: AuditEntry[], enabled: boolean): RenderRow[] {
    if (!enabled) return entries.map(e => ({parent: e, children: []}));

    const isGroupable = (e: AuditEntry): boolean => {
        if (e.event_type === 'message') return true;
        if (e.event_type === 'acl' && e.operation === 'send_message') return true;
        return false;
    };

    const groupKey = (e: AuditEntry): string =>
        `${e.actor_id}|${e.resource_id}|${e.success ? 1 : 0}|${Math.floor(e.timestamp / GROUP_WINDOW_SECONDS)}`;

    // Bucket all groupable entries by key.
    const buckets = new Map<string, AuditEntry[]>();
    for (const e of entries) {
        if (!isGroupable(e)) continue;
        const k = groupKey(e);
        const arr = buckets.get(k) || [];
        arr.push(e);
        buckets.set(k, arr);
    }

    // Track which entries we've already absorbed into a group parent.
    const absorbed = new Set<number>();
    for (const arr of buckets.values()) {
        if (arr.length < 2) continue;
        // Keep the most recent as parent; mark older as children. Entries are
        // typically returned newest-first but we don't depend on that.
        arr.sort((a, b) => b.timestamp - a.timestamp);
        for (let i = 1; i < arr.length; i++) absorbed.add(arr[i].audit_id);
    }

    const rendered: RenderRow[] = [];
    for (const e of entries) {
        if (absorbed.has(e.audit_id)) continue;
        if (!isGroupable(e)) {
            rendered.push({parent: e, children: []});
            continue;
        }
        const bucket = buckets.get(groupKey(e)) || [];
        if (bucket.length < 2) {
            rendered.push({parent: e, children: []});
        } else {
            const sorted = [...bucket].sort((a, b) => b.timestamp - a.timestamp);
            // sorted[0] is the parent (= e in iteration order, since we visit
            // newest-first); the rest are children.
            rendered.push({parent: sorted[0], children: sorted.slice(1)});
        }
    }
    return rendered;
}

/** Render the actor cell. USER badge for us:: identities; OBO badge for OBO rows. */
function ActorCell({entry}: {entry: AuditEntry}) {
    const isObo = entry.authority_mode === 'on_behalf_of' && entry.subject_id;
    const displayId = isObo ? entry.subject_id : entry.actor_id;
    const displayType = isObo ? entry.subject_type : entry.actor_type;
    const parsed = parseUserIdentity(displayId);

    return (
        <>
            {isObo && (
                <span
                    className="mr-1 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 align-middle"
                    title={`On-behalf-of: actor=${entry.actor_type}:${entry.actor_id}`}
                >
                    OBO
                </span>
            )}
            {parsed ? (
                <>
                    <UserBadge/>
                    <span>{parsed.email || '—'}</span>
                    {parsed.window && (
                        <span className="ml-1 text-gray-400 text-[10px]">{parsed.window}</span>
                    )}
                </>
            ) : (
                <>
                    <span className="text-gray-500">{displayType ? `${displayType}:` : ''}</span>
                    {displayId || '—'}
                </>
            )}
        </>
    );
}

export function AuditLogSection() {
    const ws = useContext(WebSocketContext);
    const sendRpcRequest = ws?.sendRpcRequest;

    const {query, setQuery} = useAdminQueryState();
    const {hash, setHash} = useAdminHashState();

    // URL-driven state
    const range = (query.range as RangeKey) || 'last_1h';
    const urlEventType = query.event_type ?? '';
    const urlActorType = query.actor_type ?? '';
    const urlWorkspace = query.workspace ?? '';
    const urlActorId = query.actor_id ?? '';
    const urlOperation = query.operation ?? '';
    const onlyFailures = query.only_failures === '1';
    const showSystem = query.show_system === '1';
    // Default ON. Stored as '0' in URL when disabled so the default state
    // doesn't pollute the query string.
    const groupRelated = query.group !== '0';
    const limit = Math.min(
        500,
        Math.max(10, parseInt(query.limit || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );
    const offset = Math.max(0, parseInt(query.offset || '0', 10) || 0);
    const openAuditId = hash.audit || null;

    // Local mirrors for debounced text inputs.
    const [localWorkspace, setLocalWorkspace] = useState(urlWorkspace);
    const [localActorId, setLocalActorId] = useState(urlActorId);
    const [localOperation, setLocalOperation] = useState(urlOperation);
    useEffect(() => { setLocalWorkspace(urlWorkspace); }, [urlWorkspace]);
    useEffect(() => { setLocalActorId(urlActorId); }, [urlActorId]);
    useEffect(() => { setLocalOperation(urlOperation); }, [urlOperation]);

    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (
            localWorkspace === urlWorkspace &&
            localActorId === urlActorId &&
            localOperation === urlOperation
        ) return;
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            // Filter changes reset offset to first page.
            setQuery({
                workspace: localWorkspace,
                actor_id: localActorId,
                operation: localOperation,
                offset: '0',
            });
        }, FILTER_DEBOUNCE_MS);
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [localWorkspace, localActorId, localOperation, urlWorkspace, urlActorId, urlOperation, setQuery]);

    const [entries, setEntries] = useState<AuditEntry[]>([]);
    // Server-reported total. Currently unreliable: aether-go's audit handler
    // sets total_count = len(entries) (audit_handler.go:133), so it equals the
    // page size on every full page. We trust it only when it strictly exceeds
    // entries.length — meaning the server actually computed a real total.
    // Tracked: aether-go follow-up to set total_count from a COUNT(*) query.
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const refresh = useCallback(async () => {
        if (!sendRpcRequest) return;
        setLoading(true);
        setError(null);
        try {
            const args: Record<string, unknown> = {
                limit,
                offset,
            };
            if (urlEventType) args.event_type = urlEventType;
            if (urlActorType) args.actor_type = urlActorType;
            if (urlWorkspace) args.workspace = urlWorkspace;
            if (urlActorId) args.actor_id = urlActorId;
            if (urlOperation) args.operation = urlOperation;
            if (onlyFailures) args.only_failures = true;
            const start = rangeStartTime(range);
            if (start > 0) args.start_time = start;
            if (!showSystem) {
                args.exclude_actor_types = DEFAULT_EXCLUDE_ACTOR_TYPES;
                args.exclude_workspaces = DEFAULT_EXCLUDE_WORKSPACES;
                args.exclude_service_direct = true;
            }
            const data = await adminRpc<AuditQueryResult>(sendRpcRequest, 'aether.query_audit', args);
            setEntries(data.entries);
            setTotalCount(data.total_count);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [
        sendRpcRequest, limit, offset, range, urlEventType, urlActorType,
        urlWorkspace, urlActorId, urlOperation, onlyFailures, showSystem,
    ]);

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, POLL_MS);
        return () => clearInterval(t);
    }, [refresh]);

    // total_count is reliable only when the server reported a value larger
    // than the current page. Otherwise we fall back to "more pages possible if
    // the page is full" semantics.
    const trustTotal = totalCount > entries.length;
    const hasNextPage = trustTotal
        ? offset + entries.length < totalCount
        : entries.length === limit;
    const setOffset = (next: number) => setQuery({offset: String(Math.max(0, next))});
    const setLimit = (next: number) => setQuery({limit: String(next), offset: '0'});

    const grouped = useMemo(
        () => buildGroupedRows(entries, groupRelated),
        [entries, groupRelated],
    );

    const toggleExpanded = (parentId: number) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(parentId)) next.delete(parentId);
            else next.add(parentId);
            return next;
        });
    };

    const openEntry = (auditId: number) => setHash({audit: String(auditId)});
    const closeEntry = () => setHash({audit: ''});
    const openEntryObj = useMemo(
        () => entries.find(e => String(e.audit_id) === openAuditId),
        [entries, openAuditId],
    );

    const renderOperation = (op: string) => {
        const help = OPERATION_HELP[op];
        if (!op) return <span>—</span>;
        if (!help) return <span>{op}</span>;
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted decoration-gray-300 underline-offset-2">{op}</span>
                </TooltipTrigger>
                <TooltipContent>{help}</TooltipContent>
            </Tooltip>
        );
    };

    const renderEvent = (ev: string) => {
        if (!ev) return <span>—</span>;
        const help = EVENT_TYPE_HELP[ev];
        if (!help) return <span>{ev}</span>;
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted decoration-gray-300 underline-offset-2">{ev}</span>
                </TooltipTrigger>
                <TooltipContent>{help}</TooltipContent>
            </Tooltip>
        );
    };

    const renderResource = (e: AuditEntry) => {
        if (!e.resource_type && !e.resource_id) return <span>—</span>;
        const help = RESOURCE_TYPE_HELP[e.resource_type];
        const text = `${e.resource_type}/${e.resource_id}`;
        if (!help) return <span>{text}</span>;
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="cursor-help">{text}</span>
                </TooltipTrigger>
                <TooltipContent>{help}</TooltipContent>
            </Tooltip>
        );
    };

    return (
        <TooltipProvider>
        <div className="flex flex-col h-full p-4">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Audit Log</h2>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                        {loading ? 'Loading…' :
                            entries.length === 0
                                ? 'No matches'
                                : trustTotal
                                    ? `Showing ${offset + 1}–${offset + entries.length} of ${totalCount}`
                                    : `Showing ${offset + 1}–${offset + entries.length}`}
                    </span>
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 text-sm"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
                <select
                    value={range}
                    onChange={e => setQuery({range: e.target.value, offset: '0'})}
                    className="px-2 py-1 border rounded text-sm w-32"
                >
                    {RANGE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
                <select
                    value={urlEventType}
                    onChange={e => setQuery({event_type: e.target.value, offset: '0'})}
                    className="px-2 py-1 border rounded text-sm w-32"
                >
                    <option value="">All events</option>
                    {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                    value={urlActorType}
                    onChange={e => setQuery({actor_type: e.target.value, offset: '0'})}
                    className="px-2 py-1 border rounded text-sm w-36"
                >
                    <option value="">All actors</option>
                    {ACTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                    placeholder="Workspace"
                    value={localWorkspace}
                    onChange={e => setLocalWorkspace(e.target.value)}
                    className="px-2 py-1 border rounded text-sm w-32"
                />
                <input
                    placeholder="Actor identity"
                    value={localActorId}
                    onChange={e => setLocalActorId(e.target.value)}
                    className="px-2 py-1 border rounded text-sm w-48"
                />
                <input
                    placeholder="Operation"
                    value={localOperation}
                    onChange={e => setLocalOperation(e.target.value)}
                    className="px-2 py-1 border rounded text-sm w-32"
                />
                <label className="flex items-center gap-1 text-sm">
                    <input
                        type="checkbox"
                        checked={onlyFailures}
                        onChange={e => setQuery({only_failures: e.target.checked ? '1' : '', offset: '0'})}
                    />
                    Only failures
                </label>
                <label className="flex items-center gap-1 text-sm" title="Include system principals (WorkflowEngine, Orchestrator, MetricsBridge) and the _system workspace">
                    <input
                        type="checkbox"
                        checked={showSystem}
                        onChange={e => setQuery({show_system: e.target.checked ? '1' : '', offset: '0'})}
                    />
                    Show system
                </label>
                <label className="flex items-center gap-1 text-sm" title="Collapse the message routing triple (send_message + message_received + message_routed) into one row">
                    <input
                        type="checkbox"
                        checked={groupRelated}
                        onChange={e => setQuery({group: e.target.checked ? '' : '0'})}
                    />
                    Group related
                </label>
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
                {entries.length === 0 && !loading && (
                    <EmptyState
                        title="No audit entries"
                        description="No events match the current filters. Try widening the time range or clearing filters."
                    />
                )}
                {entries.length > 0 && (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600 sticky top-0">
                            <tr>
                                <th className="px-3 py-2 text-left">When</th>
                                <th className="px-3 py-2 text-left">Event</th>
                                <th className="px-3 py-2 text-left">Actor</th>
                                <th className="px-3 py-2 text-left">Operation</th>
                                <th className="px-3 py-2 text-left">Resource</th>
                                <th className="px-3 py-2 text-left">Workspace</th>
                                <th className="px-3 py-2 text-left">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {grouped.map(({parent, children}) => {
                                const isGroup = children.length > 0;
                                const isOpen = expanded.has(parent.audit_id);
                                return (
                                    <RowFragment
                                        key={parent.audit_id}
                                        parent={parent}
                                        children={children}
                                        isGroup={isGroup}
                                        isOpen={isOpen}
                                        onToggle={() => toggleExpanded(parent.audit_id)}
                                        onOpen={openEntry}
                                        renderEvent={renderEvent}
                                        renderOperation={renderOperation}
                                        renderResource={renderResource}
                                    />
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
                <span>
                    {trustTotal
                        ? `Page ${Math.floor(offset / limit) + 1} of ${Math.max(1, Math.ceil(totalCount / limit))}`
                        : `Page ${Math.floor(offset / limit) + 1}`}
                </span>
                <div className="flex gap-2">
                    <button
                        className="px-3 py-1 rounded border disabled:opacity-50"
                        disabled={offset === 0 || loading}
                        onClick={() => setOffset(0)}
                    >First</button>
                    <button
                        className="px-3 py-1 rounded border disabled:opacity-50"
                        disabled={offset === 0 || loading}
                        onClick={() => setOffset(offset - limit)}
                    >Prev</button>
                    <button
                        className="px-3 py-1 rounded border disabled:opacity-50"
                        disabled={!hasNextPage || loading}
                        onClick={() => setOffset(offset + limit)}
                    >Next</button>
                </div>
            </div>

            {openAuditId && openEntryObj && (
                <AuditDetailDrawer entry={openEntryObj} onClose={closeEntry}/>
            )}
        </div>
        </TooltipProvider>
    );
}

interface RowFragmentProps {
    parent: AuditEntry;
    children: AuditEntry[];
    isGroup: boolean;
    isOpen: boolean;
    onToggle: () => void;
    onOpen: (auditId: number) => void;
    renderEvent: (ev: string) => ReactNode;
    renderOperation: (op: string) => ReactNode;
    renderResource: (e: AuditEntry) => ReactNode;
}

function RowFragment({
    parent,
    children,
    isGroup,
    isOpen,
    onToggle,
    onOpen,
    renderEvent,
    renderOperation,
    renderResource,
}: RowFragmentProps) {
    const renderRow = (e: AuditEntry, indent: boolean) => (
        <tr
            key={e.audit_id}
            onClick={() => onOpen(e.audit_id)}
            className={`border-t cursor-pointer hover:bg-blue-50 ${e.success ? '' : 'bg-red-50/40'} ${indent ? 'bg-gray-50/50' : ''}`}
        >
            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                <div className="flex items-center gap-1">
                    {indent && <span className="ml-4 text-gray-300">└</span>}
                    <TimeAgo ts={e.timestamp}/>
                </div>
            </td>
            <td className="px-3 py-2">{renderEvent(e.event_type)}</td>
            <td className="px-3 py-2 font-mono text-xs break-all">
                <ActorCell entry={e}/>
            </td>
            <td className="px-3 py-2">{renderOperation(e.operation)}</td>
            <td className="px-3 py-2 font-mono text-xs break-all">{renderResource(e)}</td>
            <td className="px-3 py-2">{e.workspace || '—'}</td>
            <td className="px-3 py-2">
                {e.success ? (
                    <span className="text-green-700">ok</span>
                ) : (
                    <span className="text-red-700" title={e.error_message}>fail</span>
                )}
            </td>
        </tr>
    );

    if (!isGroup) return <>{renderRow(parent, false)}</>;

    // Parent row with chevron + count badge in the When column.
    const parentRow = (
        <tr
            key={parent.audit_id}
            className={`border-t hover:bg-blue-50 ${parent.success ? '' : 'bg-red-50/40'}`}
        >
            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); onToggle(); }}
                        className="text-gray-400 hover:text-gray-700 px-1"
                        aria-label={isOpen ? 'Collapse group' : 'Expand group'}
                        title={isOpen ? 'Collapse group' : `Expand group (+${children.length})`}
                    >
                        {isOpen ? '▾' : '▸'}
                    </button>
                    <span
                        className="cursor-pointer"
                        onClick={() => onOpen(parent.audit_id)}
                    >
                        <TimeAgo ts={parent.timestamp}/>
                    </span>
                    <span
                        className="ml-1 inline-flex items-center rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-700"
                        title={`${children.length + 1} related events`}
                    >
                        +{children.length}
                    </span>
                </div>
            </td>
            <td className="px-3 py-2 cursor-pointer" onClick={() => onOpen(parent.audit_id)}>{renderEvent(parent.event_type)}</td>
            <td className="px-3 py-2 font-mono text-xs break-all cursor-pointer" onClick={() => onOpen(parent.audit_id)}>
                <ActorCell entry={parent}/>
            </td>
            <td className="px-3 py-2 cursor-pointer" onClick={() => onOpen(parent.audit_id)}>{renderOperation(parent.operation)}</td>
            <td className="px-3 py-2 font-mono text-xs break-all cursor-pointer" onClick={() => onOpen(parent.audit_id)}>{renderResource(parent)}</td>
            <td className="px-3 py-2 cursor-pointer" onClick={() => onOpen(parent.audit_id)}>{parent.workspace || '—'}</td>
            <td className="px-3 py-2 cursor-pointer" onClick={() => onOpen(parent.audit_id)}>
                {parent.success ? (
                    <span className="text-green-700">ok</span>
                ) : (
                    <span className="text-red-700" title={parent.error_message}>fail</span>
                )}
            </td>
        </tr>
    );

    return (
        <>
            {parentRow}
            {isOpen && children.map(c => renderRow(c, true))}
        </>
    );
}
