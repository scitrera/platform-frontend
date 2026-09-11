import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {WebSocketApiContext, WebSocketStatusContext} from './WebSocketContext';
import {USER} from '../constants/WebSocketConstants.jsx';
import {useWorkspaceStore} from '../stores/workspaceStore';
import type {KbArticle, KbGraphAnalysis, KbMemory, KbMetadata} from '../types/knowledgebase';

interface KnowledgebaseState {
    metadata: KbMetadata | null;
    articles: KbArticle[];
    articleCache: Record<string, KbArticle>;
    memoryCache: Record<string, KbMemory>;
    activeArticleId: string | null;
    graph: KbGraphAnalysis | null;
    loading: boolean;
    error: string | null;
    lastGeneratedAt: string | null;
    /** True when the current user should see admin controls (regenerate). */
    canAdmin: boolean;

    /** Declare that a consumer needs this data, triggering the first load.
     *  Idempotent — call it from a mount effect. */
    ensureLoaded: () => void;

    loadMetadata: () => Promise<void>;
    loadArticles: (articleType?: string) => Promise<void>;
    loadArticle: (id: string) => Promise<KbArticle | null>;
    loadMemory: (id: string) => Promise<KbMemory | null>;
    loadGraph: (includeMemories?: boolean) => Promise<void>;
    regenerate: (full?: boolean) => Promise<void>;
    setActiveArticleId: (id: string | null) => void;
}

const KnowledgebaseContext = createContext<KnowledgebaseState | null>(null);

type SendRpcRequest = (type: string, payload: unknown, timeout?: number) => Promise<unknown>;

/** MemoryLayer service name for the generic, allow-listed service proxy. */
const KB_SERVICE = 'memorylayer';

/**
 * Maps the legacy backend-agent func names to the generic service-proxy ops.
 * The ws_server validates these against a per-service allow-list and dispatches
 * them directly (no backend agent). See docs/DESIGN_service_proxy_wss.md.
 */
const KB_FUNC_TO_OP: Record<string, string> = {
    kb_metadata: 'kb.metadata',
    kb_list_articles: 'kb.list_articles',
    kb_get_article: 'kb.get_article',
    kb_graph: 'kb.graph',
    kb_regenerate: 'kb.regenerate',
    memory_get: 'memory.get',
};

async function kbRpc<T>(
    sendRpcRequest: SendRpcRequest,
    workspaceId: string,
    funcName: string,
    args: Record<string, unknown>,
): Promise<T> {
    const op = KB_FUNC_TO_OP[funcName];
    if (!op) {
        throw new Error(`Unknown knowledgebase op for func: ${funcName}`);
    }
    // Generic service-proxy wire shape: {service, op, workspaceId, args}.
    // The backend replies with {result: <data>}.
    const response = await sendRpcRequest(USER.TOOL_CALL, {
        service: KB_SERVICE,
        op,
        workspaceId,
        args,
    }) as {result?: unknown} | undefined;
    return (response?.result as T);
}

export function KnowledgebaseProvider({children}: {children: React.ReactNode}) {
    // Narrow slices, not the whole context: the combined value also carries
    // dynamicJSXContent, which changes on every inbound JSX message and would
    // re-run every effect keyed on it at message rate.
    const wsApi = useContext(WebSocketApiContext);
    const wsStatus = useContext(WebSocketStatusContext);
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const currentWorkspaceRole = useWorkspaceStore(s => s.currentWorkspaceInfo?.role);

    const [metadata, setMetadata] = useState<KbMetadata | null>(null);
    const [articles, setArticles] = useState<KbArticle[]>([]);
    const [articleCache, setArticleCache] = useState<Record<string, KbArticle>>({});
    const [memoryCache, setMemoryCache] = useState<Record<string, KbMemory>>({});
    const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
    const [graph, setGraph] = useState<KbGraphAnalysis | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
    // Set by ensureLoaded() when a consumer first mounts. Until then this
    // provider holds no data and issues no requests.
    const [loadRequested, setLoadRequested] = useState(false);

    // Regenerating a KB is a workspace-admin action (it re-runs the full,
    // LLM-heavy pipeline). Gate on the current workspace's role — only an
    // 'admin' on THIS workspace may trigger it. The backend service proxy runs
    // under the user's OBO grant, so MemoryLayer independently enforces this;
    // canAdmin is the UI affordance, not the security boundary.
    const canAdmin = currentWorkspaceRole === 'admin';

    // Track the workspace we last loaded data for so we can reset on change.
    const loadedForWorkspace = useRef<string | null>(null);

    // Track the last KB-update task id we reloaded for, to coalesce duplicate
    // terminal events for the same generation.
    const lastKbReloadTaskId = useRef<string | null>(null);

    // Latest article cache, read by loadArticle. loadArticle must NOT depend on
    // articleCache directly — that would change its identity on every cache
    // write and re-fire any consumer effect keyed on it, hammering the backend.
    const articleCacheRef = useRef(articleCache);
    articleCacheRef.current = articleCache;
    const memoryCacheRef = useRef(memoryCache);
    memoryCacheRef.current = memoryCache;

    useEffect(() => {
        if (currentWorkspaceId !== loadedForWorkspace.current) {
            loadedForWorkspace.current = currentWorkspaceId;
            lastKbReloadTaskId.current = null;
            setMetadata(null);
            setArticles([]);
            setArticleCache({});
            setMemoryCache({});
            setActiveArticleId(null);
            setGraph(null);
            setError(null);
            setLastGeneratedAt(null);
        }
    }, [currentWorkspaceId]);

    const loadMetadata = useCallback(async () => {
        const sendRpcRequest = wsApi?.sendRpcRequest;
        // Bail quietly (no error) until the socket is connected — the load is
        // re-driven on connect by the effect below.
        if (!sendRpcRequest || !wsStatus?.isConnected || !currentWorkspaceId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await kbRpc<KbMetadata>(sendRpcRequest, currentWorkspaceId, 'kb_metadata', {});
            setMetadata(result);
            if (result?.generated_at) {
                setLastGeneratedAt(result.generated_at);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load knowledgebase metadata');
        } finally {
            setLoading(false);
        }
    }, [wsApi?.sendRpcRequest, wsStatus?.isConnected, currentWorkspaceId]);

    const loadArticles = useCallback(async (articleType?: string) => {
        const sendRpcRequest = wsApi?.sendRpcRequest;
        if (!sendRpcRequest || !wsStatus?.isConnected || !currentWorkspaceId) return;
        setLoading(true);
        setError(null);
        try {
            const args: Record<string, unknown> = {};
            if (articleType) args.article_type = articleType;
            const result = await kbRpc<KbArticle[]>(sendRpcRequest, currentWorkspaceId, 'kb_list_articles', args);
            setArticles(result ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load articles');
        } finally {
            setLoading(false);
        }
    }, [wsApi?.sendRpcRequest, wsStatus?.isConnected, currentWorkspaceId]);

    const ensureLoaded = useCallback(() => setLoadRequested(true), []);

    // Load only once something actually wants the data. This provider is
    // mounted app-wide (App.jsx), so an unconditional load here fetched the
    // metadata AND the article list on every page load of every app — two
    // sequential round-trips whose results nothing rendered, since every
    // consumer of this context lives under components/Apps/Knowledgebase.
    // It repeated on each reconnect, so a flaky socket replayed them.
    //
    // Gated rather than moved into the app so the cache still survives
    // switching apps: the first visit pays, later visits are instant.
    useEffect(() => {
        // Keyed on connection state, not mount: the WebSocket may finalize
        // AFTER the KB app mounts, so loading at mount would fire before
        // connect, reject ("Socket not connected"), and never retry. This
        // also re-drives the load on workspace change / reconnect — but only
        // for a session that has actually opened the app.
        if (!loadRequested || !wsStatus?.isConnected || !currentWorkspaceId) return;
        void loadMetadata().then(() => loadArticles());
    }, [loadRequested, wsStatus?.isConnected, currentWorkspaceId, loadMetadata, loadArticles]);

    // Live-reload the KB view when its background update task finishes. The
    // ingest→kb pipeline emits APP_PROGRESS events with bg_kind === 'kb'; on a
    // terminal (completed) event for the current workspace we re-pull metadata
    // and the article list so the new content appears without a manual refresh.
    useEffect(() => {
        const registerAppListener = wsApi?.registerAppListener;
        if (!registerAppListener || !currentWorkspaceId) return undefined;

        const unsubscribe = registerAppListener(USER.APP_PROGRESS, (payload: any) => {
            if (!payload || payload.bg_kind !== 'kb') return;
            if (payload.status !== 'completed') return;
            // Only react to events for the current workspace.
            if (payload.workspace && payload.workspace !== currentWorkspaceId) return;
            // Coalesce duplicate terminal events for the same generation/task.
            if (payload.id && payload.id === lastKbReloadTaskId.current) return;
            lastKbReloadTaskId.current = payload.id ?? null;

            void loadMetadata();
            void loadArticles();
        }, 'KnowledgebaseContext');

        return () => {
            unsubscribe?.();
        };
        // Depend on the FIELD, not the whole context object. The provider
        // builds its value inline, so `ws` is a new object on every render of
        // WebSocketProvider — which happens on every inbound message. Keying
        // on it re-ran this effect ~10x/sec on load, detaching and reattaching
        // the socket handler each time. registerAppListener is a useCallback
        // keyed on [socket], so it only changes when the socket really does.
    }, [wsApi?.registerAppListener, currentWorkspaceId, loadMetadata, loadArticles]);

    const loadArticle = useCallback(async (id: string): Promise<KbArticle | null> => {
        const sendRpcRequest = wsApi?.sendRpcRequest;
        if (!sendRpcRequest || !wsStatus?.isConnected || !currentWorkspaceId) return null;
        // Cache by PRESENCE (not by content_md): once we've fetched an id we
        // never refetch it, even if the result lacked content — otherwise a
        // malformed/contentless response loops the caller forever.
        const cached = articleCacheRef.current[id];
        if (cached !== undefined) {
            return cached;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await kbRpc<KbArticle>(sendRpcRequest, currentWorkspaceId, 'kb_get_article', {article_id: id});
            // Always record the attempt (even a null result) so it isn't refetched.
            setArticleCache(prev => ({...prev, [id]: result ?? null as unknown as KbArticle}));
            return result ?? null;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load article');
            return null;
        } finally {
            setLoading(false);
        }
    }, [wsApi?.sendRpcRequest, wsStatus?.isConnected, currentWorkspaceId]);

    const loadMemory = useCallback(async (id: string): Promise<KbMemory | null> => {
        const sendRpcRequest = wsApi?.sendRpcRequest;
        if (!sendRpcRequest || !wsStatus?.isConnected || !currentWorkspaceId) return null;
        // Cache by presence (mirrors loadArticle): never refetch an id, even if
        // the result was null, so a missing memory doesn't loop the caller.
        const cached = memoryCacheRef.current[id];
        if (cached !== undefined) {
            return cached;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await kbRpc<KbMemory>(sendRpcRequest, currentWorkspaceId, 'memory_get', {memory_id: id});
            setMemoryCache(prev => ({...prev, [id]: result ?? null as unknown as KbMemory}));
            return result ?? null;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load memory');
            return null;
        } finally {
            setLoading(false);
        }
    }, [wsApi?.sendRpcRequest, wsStatus?.isConnected, currentWorkspaceId]);

    const loadGraph = useCallback(async (includeMemories = false) => {
        const sendRpcRequest = wsApi?.sendRpcRequest;
        if (!sendRpcRequest || !currentWorkspaceId) return;
        setLoading(true);
        setError(null);
        try {
            // Default to the lighter communities-only graph; the graph view opts
            // into the full per-memory graph via "Show All Memories".
            const result = await kbRpc<KbGraphAnalysis>(
                sendRpcRequest, currentWorkspaceId, 'kb_graph', {include_memories: includeMemories},
            );
            setGraph(result ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load graph');
        } finally {
            setLoading(false);
        }
    }, [wsApi?.sendRpcRequest, currentWorkspaceId]);

    const regenerate = useCallback(async (full?: boolean) => {
        const sendRpcRequest = wsApi?.sendRpcRequest;
        if (!sendRpcRequest || !currentWorkspaceId) return;
        setLoading(true);
        setError(null);
        try {
            const args: Record<string, unknown> = {};
            if (full) args.full = true;
            const result = await kbRpc<KbMetadata>(sendRpcRequest, currentWorkspaceId, 'kb_regenerate', args);
            setMetadata(result ?? null);
            if (result?.generated_at) {
                setLastGeneratedAt(result.generated_at);
            }
            // Refresh article list after regeneration
            await loadArticles();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Regeneration failed');
        } finally {
            setLoading(false);
        }
    }, [wsApi?.sendRpcRequest, currentWorkspaceId, loadArticles]);

    const value: KnowledgebaseState = {
        metadata,
        articles,
        articleCache,
        memoryCache,
        activeArticleId,
        graph,
        loading,
        error,
        lastGeneratedAt,
        canAdmin,
        ensureLoaded,
        loadMetadata,
        loadArticles,
        loadArticle,
        loadMemory,
        loadGraph,
        regenerate,
        setActiveArticleId,
    };

    return (
        <KnowledgebaseContext.Provider value={value}>
            {children}
        </KnowledgebaseContext.Provider>
    );
}

export {KnowledgebaseContext};
