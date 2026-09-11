import {useEffect, useRef} from 'react';
import {useChatState} from './useChatState';
import {useToasts} from './useToasts.jsx';
import {useWebSocket} from './useWebSocket.jsx';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useChatRailStore, type ChatRailState} from '@/stores/chatRailStore';
import {AGENT, CHAT} from '@/constants/WebSocketConstants.jsx';
import {
    nextAgentToolCatalogSnapshot,
    registerAgentTool,
    subscribeAgentToolRegistry,
    unregisterAgentTool,
    type AgentToolArgs,
} from '@/utils/agentToolRegistry';
import type {AppInfo} from '@/types/state';
import {DEFAULT_THREAD_ID, type ChatThread} from '@/types/chat';

/**
 * Register the default suite of agent→frontend tools. Mount once near the
 * app root (Layout.jsx) so the registry is populated for the lifetime of
 * the session. Tools that depend on React context (useChatState, useToasts)
 * are registered here; pure store-backed tools could be registered at module
 * level but live alongside the others for discoverability.
 *
 * Backend agents reach these via the WebSocket AGENT.TOOL_CALL channel —
 * see `wsMessageHandlers.js`.
 */
export default function useAgentTools(): void {
    const chatState = useChatState();
    const chatStateRef = useRef(chatState);
    chatStateRef.current = chatState;
    const {addToast} = useToasts();
    const {sendRpcRequest, isConnected} = useWebSocket();

    useEffect(() => {
        const toolNames: string[] = [];

        const register = (
            name: string,
            title: string,
            description: string,
            properties: Record<string, unknown>,
            handler: (args: AgentToolArgs) => unknown | Promise<unknown>,
            required: string[] = [],
        ) => {
            registerAgentTool({
                descriptor: {
                    name,
                    title,
                    description,
                    input_schema: {
                        type: 'object',
                        properties,
                        ...(required.length ? {required} : {}),
                        additionalProperties: true,
                    },
                    kind: 'remote',
                    awaits_result: true,
                    toolsets: ['frontend', 'web'],
                },
                effect: 'interaction',
                handler,
            });
            toolNames.push(name);
        };

        // ─── Workspace ─────────────────────────────────────────────
        register(
            'frontend_switch_workspace',
            'Switch workspace',
            'Navigate this browser window to a different workspace.',
            {id: {type: 'string', description: 'Workspace id to open.'}},
            (args) => {
                const workspaceId = args.workspaceId ?? args.id ?? null;
                useWorkspaceStore.getState().setCurrentWorkspace(
                    workspaceId === null ? null : String(workspaceId),
                );
                return useWorkspaceStore.getState().currentWorkspaceId;
            },
        );

        // ─── Apps ──────────────────────────────────────────────────
        register(
            'frontend_select_app',
            'Select app',
            'Open an application panel in this browser window.',
            {id: {type: 'string', description: 'Application id to open.'}},
            (args) => {
                const id = args.id ?? args.appId;
                if (!id) throw new Error('select_app requires id');
                const app: AppInfo = {
                    id: String(id),
                    type: typeof args.type === 'string' ? args.type : String(id),
                    title: typeof args.title === 'string' ? args.title : undefined,
                    mode: typeof args.mode === 'string' ? args.mode : null,
                    iframe: typeof args.iframe === 'string' ? args.iframe : null,
                };
                useAppPanelStore.getState().loadApp(app);
                return app.id;
            },
            ['id'],
        );

        register(
            'frontend_close_app',
            'Close app',
            'Close the application panel in this browser window.',
            {},
            () => useAppPanelStore.getState().closeMainApp(),
        );

        // ─── Chat rail state ───────────────────────────────────────
        register(
            'frontend_set_chat_state',
            'Set chat state',
            'Set the chat rail layout in this browser window.',
            {state: {type: 'string', enum: ['collapsed', 'sidebar', 'fullscreen']}},
            (args) => {
                const next = args.state;
                if (next !== 'collapsed' && next !== 'sidebar' && next !== 'fullscreen') {
                    throw new Error(`set_chat_state: invalid state "${String(next)}"`);
                }
                useChatRailStore.getState().setState(next as ChatRailState);
                return next;
            },
            ['state'],
        );

        register(
            'frontend_expand_chat',
            'Expand chat',
            'Expand the chat rail in this browser window.',
            {},
            () => {
                useChatRailStore.getState().expand();
                return useChatRailStore.getState().state;
            },
        );

        register(
            'frontend_collapse_chat',
            'Collapse chat',
            'Collapse the chat rail in this browser window.',
            {},
            () => useChatRailStore.getState().setState('collapsed'),
        );

        // ─── Threads ───────────────────────────────────────────────
        register(
            'frontend_select_thread',
            'Select thread',
            'Make a chat thread active in this browser window.',
            {threadId: {type: 'string', description: 'Thread id to select.'}},
            async (args) => {
                const currentChatState = chatStateRef.current;
                const raw = args.threadId;
                const threadId = (raw === null || raw === undefined || raw === '') ? DEFAULT_THREAD_ID : String(raw);

                // The default thread is always valid — no lookup needed.
                if (threadId === DEFAULT_THREAD_ID) {
                    currentChatState.selectThread(DEFAULT_THREAD_ID);
                    return {threadId: DEFAULT_THREAD_ID};
                }

                // Check whether the thread is already in local state.
                let thread = currentChatState.threads.find(t => t.id === threadId);

                if (!thread) {
                    // Thread not found locally — likely just created by the backend and not
                    // yet in the local list. Re-fetch the thread list and retry the lookup.
                    const wsId = useWorkspaceStore.getState().currentWorkspaceId;
                    if (!wsId) throw new Error(`select_thread: no active workspace to refetch threads`);
                    try {
                        const freshThreads = await sendRpcRequest<ChatThread[]>(CHAT.THREAD_LIST, {
                            workspaceId: wsId,
                        });
                        if (Array.isArray(freshThreads)) {
                            currentChatState.setThreadsList(freshThreads);
                            thread = freshThreads.find(t => t.id === threadId) ?? undefined;
                        }
                    } catch (refetchErr) {
                        throw new Error(
                            `select_thread: thread ${threadId} not in local list and refetch failed — ` +
                            String(refetchErr instanceof Error ? refetchErr.message : refetchErr),
                        );
                    }
                }

                if (!thread) {
                    throw new Error(`select_thread: thread ${threadId} not found after refetch`);
                }

                currentChatState.selectThread(threadId);
                return {threadId};
            },
        );

        // ─── User feedback ─────────────────────────────────────────
        register(
            'frontend_show_toast',
            'Show toast',
            'Display a notification toast in this browser window.',
            {
                message: {type: 'string'},
                kind: {type: 'string', enum: ['info', 'success', 'warning', 'error']},
                duration: {type: 'number'},
            },
            (args) => {
                const message = typeof args.message === 'string' ? args.message : '';
                const kindRaw = typeof args.kind === 'string' ? args.kind : 'info';
                const kind: 'info' | 'success' | 'warning' | 'error' =
                    kindRaw === 'success' || kindRaw === 'warning' || kindRaw === 'error'
                        ? kindRaw
                        : 'info';
                const duration = typeof args.duration === 'number' ? args.duration : undefined;
                addToast(message, kind, duration);
            },
            ['message'],
        );

        // Publish a full leased snapshot after all handlers are installed, and
        // refresh it well before the five-minute backend lease expires. The
        // server derives every authority-bearing field from this authenticated
        // socket/user session; this payload contains definitions only.
        let disposed = false;
        const publishCatalog = async () => {
            if (disposed || !isConnected) return;
            try {
                await sendRpcRequest(AGENT.TOOL_CATALOG, nextAgentToolCatalogSnapshot());
            } catch (err) {
                console.warn('Unable to publish browser tool catalog:', err);
            }
        };
        // Serialize publications so monotonic sequence N always reaches the
        // backend before N+1, even when several components register tools in
        // one render or a heartbeat overlaps a registry change.
        let publicationQueue = Promise.resolve();
        const queueCatalogPublication = () => {
            publicationQueue = publicationQueue.then(publishCatalog, publishCatalog);
        };
        const unsubscribeCatalog = subscribeAgentToolRegistry(queueCatalogPublication);
        queueCatalogPublication();
        const catalogHeartbeat = window.setInterval(() => {
            queueCatalogPublication();
        }, 120_000);

        return () => {
            disposed = true;
            window.clearInterval(catalogHeartbeat);
            unsubscribeCatalog();
            for (const name of toolNames) unregisterAgentTool(name);
        };
    }, [addToast, sendRpcRequest, isConnected]);
}
