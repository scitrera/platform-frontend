import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {WebSocketApiContext, WebSocketStatusContext} from './WebSocketContext';
import {USER} from '../constants/WebSocketConstants.jsx';
import {useWorkspaceStore} from '../stores/workspaceStore';
import type {LibraryFile} from '../types/library';

interface LibraryState {
    files: LibraryFile[];
    loading: boolean;
    error: string | null;

    /** Declare that a consumer needs this data, triggering the first load.
     *  Idempotent — call it from a mount effect. */
    ensureLoaded: () => void;

    loadFiles: (path?: string, sources?: string[]) => Promise<void>;
    deleteFiles: (docIds: string[]) => Promise<void>;
}

const LibraryContext = createContext<LibraryState | null>(null);

type SendRpcRequest = (type: string, payload: unknown, timeout?: number) => Promise<unknown>;

/** platform-bridge service name for the generic, allow-listed service proxy. */
const LIBRARY_SERVICE = 'platform_bridge';

/**
 * Maps the legacy backend-agent func names to the generic service-proxy ops.
 * The ws_server validates these against a per-service allow-list and relays
 * them to sv::platform-bridge (no backend agent). See docs/DESIGN_service_proxy_wss.md.
 */
const LIBRARY_FUNC_TO_OP: Record<string, string> = {
    list_files: 'files.list',
    delete_files: 'files.delete',
};

async function libRpc<T>(
    sendRpcRequest: SendRpcRequest,
    workspaceId: string,
    funcName: string,
    args: Record<string, unknown>,
): Promise<T> {
    const op = LIBRARY_FUNC_TO_OP[funcName];
    if (!op) {
        throw new Error(`Unknown library op for func: ${funcName}`);
    }
    // Generic service-proxy wire shape: {service, op, workspaceId, args}.
    // The backend replies with {result: <data>}.
    const response = await sendRpcRequest(USER.TOOL_CALL, {
        service: LIBRARY_SERVICE,
        op,
        workspaceId,
        args,
    }) as {result?: unknown} | undefined;
    return (response?.result as T);
}

/**
 * Convert a raw timestamp from the bridge (whatever MemoryLayer emits — ISO
 * string, unix seconds, or unix ms) to unix epoch milliseconds, which the
 * FileBrowser feeds to ``new Date(...)``. Mirrors the old agent's
 * ``dt_to_unix_ms`` conversion in ``BasicAppsUX.on_arg_library_get_files``.
 * Returns null when the value is missing/unparseable (e.g. a synthesized
 * ``_pending`` row that omits a timestamp).
 */
function toMs(v: unknown): number | null {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
        // Heuristic: unix seconds (< ~year 33658 in ms) vs already-ms.
        return v < 1e12 ? v * 1000 : v;
    }
    const t = Date.parse(String(v));
    return Number.isNaN(t) ? null : t;
}

/**
 * Map a bridge ``files.list`` row to the flat FileBrowser data shape. The
 * bridge returns ti.list_files_by_path rows (vfs_ref/doc_id/name/provider/
 * size/path/modified/created_at/...) — already the right keys — so this only
 * normalizes the timestamps to unix ms and guarantees the identity fields are
 * strings.
 */
function mapFileRow(row: Record<string, unknown>): LibraryFile {
    return {
        ...(row as unknown as LibraryFile),
        doc_id: (row.doc_id as string) ?? '',
        // Normalized explicitly (not just via the spread) because rowKey()
        // prefers it for selection/delete; leaving it undefined silently falls
        // back to doc_id, which is empty for a not-yet-ingested file.
        vfs_ref: (row.vfs_ref as string) ?? '',
        name: (row.name as string) ?? '',
        provider: (row.provider as string) ?? '',
        uploading: Boolean(row.uploading),
        size: (row.size as number) ?? 0,
        path: (row.path as string) ?? '',
        modified: toMs(row.modified),
        created_at: toMs(row.created_at),
        updated_at: toMs(row.updated_at),
    };
}

export function LibraryProvider({children}: {children: React.ReactNode}) {
    // Narrow slices, not the whole context: the combined value also carries
    // dynamicJSXContent, which changes on every inbound JSX message and would
    // re-run every effect keyed on it at message rate.
    const wsApi = useContext(WebSocketApiContext);
    const wsStatus = useContext(WebSocketStatusContext);
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);

    const [files, setFiles] = useState<LibraryFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Set by ensureLoaded() when a consumer first mounts. Until then this
    // provider holds no data and issues no requests.
    const [loadRequested, setLoadRequested] = useState(false);

    // Track the workspace we last loaded data for so we can reset on change.
    const loadedForWorkspace = useRef<string | null>(null);

    useEffect(() => {
        if (currentWorkspaceId !== loadedForWorkspace.current) {
            loadedForWorkspace.current = currentWorkspaceId;
            setFiles([]);
            setError(null);
        }
    }, [currentWorkspaceId]);

    const loadFiles = useCallback(async (path?: string, sources?: string[]) => {
        const sendRpcRequest = wsApi?.sendRpcRequest;
        // Bail quietly (no error) until the socket is connected — the load is
        // re-driven on connect by the effect below.
        if (!sendRpcRequest || !wsStatus?.isConnected || !currentWorkspaceId) return;
        setLoading(true);
        setError(null);
        try {
            const args: Record<string, unknown> = {};
            if (path) args.path = path;
            // Explicit source allow-list for a source picker. Omitted, the
            // bridge hides agent-output connectors (sahara_artifact,
            // agent_generated) so working artifacts don't bury real uploads;
            // naming them here lists them.
            if (sources && sources.length) args.sources = sources;
            const result = await libRpc<{files?: Record<string, unknown>[]}>(
                sendRpcRequest, currentWorkspaceId, 'list_files', args,
            );
            const rows = result?.files ?? [];
            setFiles(rows.map(mapFileRow));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load files');
        } finally {
            setLoading(false);
        }
    }, [wsApi?.sendRpcRequest, wsStatus?.isConnected, currentWorkspaceId]);

    const deleteFiles = useCallback(async (docIds: string[]) => {
        const sendRpcRequest = wsApi?.sendRpcRequest;
        if (!sendRpcRequest || !wsStatus?.isConnected || !currentWorkspaceId) return;
        if (!docIds || docIds.length === 0) return;
        setLoading(true);
        setError(null);
        try {
            await libRpc<{deleted?: number}>(
                sendRpcRequest, currentWorkspaceId, 'delete_files', {doc_ids: docIds},
            );
            // No reload here: the caller refreshes once the delete resolves,
            // and doing it in both places fetched the listing twice per
            // delete — the second fetch racing the first's state update.
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete files');
            throw e;  // surfaced to the caller so it can drop its pending state
        } finally {
            setLoading(false);
        }
    }, [wsApi?.sendRpcRequest, wsStatus?.isConnected, currentWorkspaceId]);

    const ensureLoaded = useCallback(() => setLoadRequested(true), []);

    // Load only once something actually wants the data. This provider is
    // mounted app-wide (App.jsx), so an unconditional load listed the whole
    // workspace's files on every page load of every app — a result nothing
    // rendered, since the only consumer of this context is the Library app.
    // It repeated on each reconnect, so a flaky socket replayed it.
    //
    // Gated rather than moved into the app so the listing still survives
    // switching apps: the first visit pays, later visits are instant.
    useEffect(() => {
        // Keyed on connection state, not mount: the WebSocket may finalize
        // AFTER the Library app mounts, so loading at mount would fire before
        // connect, reject ("Socket not connected"), and never retry. This also
        // re-drives the load on workspace change / reconnect — but only for a
        // session that has actually opened the app.
        if (!loadRequested || !wsStatus?.isConnected || !currentWorkspaceId) return;
        void loadFiles();
    }, [loadRequested, wsStatus?.isConnected, currentWorkspaceId, loadFiles]);

    const value: LibraryState = {
        files,
        loading,
        error,
        ensureLoaded,
        loadFiles,
        deleteFiles,
    };

    return (
        <LibraryContext.Provider value={value}>
            {children}
        </LibraryContext.Provider>
    );
}

export {LibraryContext};
