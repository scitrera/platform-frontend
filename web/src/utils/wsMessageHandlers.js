import {DYNAMIC_JSX, USER, AGENT, WORKSPACE, CONNECTION, CHAT} from '../constants/WebSocketConstants';
import {DEBUG_MODE} from '../constants/AppConstants';
import {SOCKET_CONFIG} from './wsConfig.js';
import {useAuthStore} from '../stores/authStore';
import {useWorkspaceStore} from '../stores/workspaceStore';
import {useAppPanelStore} from '../stores/appPanelStore';
import {invokeAgentTool} from './agentToolRegistry';
import {legacyMessageToSpec, historyToSpecMessages} from './messaging/specAdapters';
import {DEFAULT_THREAD_ID} from '../types/chat';

// The frontend uses ``DEFAULT_THREAD_ID`` ("_default") as the single canonical
// id for the workspace-default thread, matching the backend (see
// scitrera_ai_runtime.core.common.RTEventGateway.DEFAULT_THREAD_ID). Defensively
// canonicalize any blank/missing inbound threadId to it so per-thread dispatch
// (token streaming, progress pill, tool blocks) matches the currently-selected
// thread even if an upstream producer omits the id.
const normalizeIncomingThreadId = (threadId) =>
    (threadId == null || threadId === '') ? DEFAULT_THREAD_ID : threadId;

/**
 * Set up all WebSocket message handlers on a socket instance.
 *
 * Extracted from WebSocketProvider.connect() to keep the connection logic
 * focused on socket lifecycle and this module focused on message routing.
 *
 * Handlers dispatch directly into the Zustand stores (authStore,
 * workspaceStore, appPanelStore); there is no reducer dispatch anymore.
 *
 * Phase 4 cleanup: the legacy ``APPEND_TOKENS`` / ``APPEND_TOOL_BLOCK`` /
 * ``APPEND_CITATIONS`` / ``APPEND_DYNAMIC`` chat-state handlers are gone.
 * Cowork + sandbox-sidecar emit only ``CHAT_STREAM`` now (Phase 3); the
 * legacy event constants live on in ``WebSocketConstants.jsx`` only until
 * Phase 7 deletes them from the protocol entirely.
 */
export function setupSocketMessageHandlers(socketInstance, {
    setDynamicJSXContent,
    setBackendVersion,
    pendingRequests,
    activeThreadIdRef,
    setChatThreads,
    setSpecMessagesList,
    upsertSpecMessage,
    setLatestChatProgress,
    // chat_message task lifecycle (P3) — feed activeTaskByThread in useChatState
    setActiveChatTask,
    clearActiveChatTask,
    setActiveChatTasksMap,
    // LLM-generated thread title updates (THREAD_AUTO_RENAMED)
    renameThreadInList,
    // Universal messaging-spec stream dispatch. Feeds the applyEvent
    // reducer in useChatState.specMessages.
    dispatchSpecEvent,
    // eslint-disable-next-line no-unused-vars
    inFlightByType, // reserved for future dedup usage
}) {
    // JSX message handling logic (shared between RPC and direct messages)
    const jsxMessageHandler = (message, deleteId = null) => {
        if (message == null && deleteId != null) {
            setDynamicJSXContent(prev => {
                const {[deleteId]: _, ...rest} = prev;
                return rest;
            });
        } else if (message.payload.error?.message) {
            DEBUG_MODE && console.log(`Error on JSX Content: ${message.payload.error.message}`);
            useAppPanelStore.getState().closeMainApp();
        } else {
            setDynamicJSXContent(prev => ({
                ...prev, [message.payload.componentId]: message.payload,
            }));
        }
    };

    // RPC response handler
    socketInstance.on(CONNECTION.RPC_MESSAGE, ({id, type, payload, version}) => {
        const handlers = pendingRequests.current.get(id);
        if (!handlers) {
            return console.warn(`No pending RPC for id ${id}`);
        }
        pendingRequests.current.delete(id);
        (DEBUG_MODE && type !== WORKSPACE.GET_BACKGROUND_TASKS &&
            console.log(`Websocket RPC message received: ${id}|${type}`, payload));
        if (version) {
            setBackendVersion(version);
        }

        try {
            // Intercept DYNAMIC_JSX.CONTENT RPC responses to update JSX state
            if (type === DYNAMIC_JSX.CONTENT) {
                jsxMessageHandler({type, payload});
            }

            if (type === CONNECTION.RPC_EXCEPTION) {
                // Remove JSX data on RPC exception for JSX requests
                if (payload.type === DYNAMIC_JSX.CONTENT) {
                    const componentId = payload.payload?.appId;
                    DEBUG_MODE && console.log(`JSX REMOVE: ${componentId}`)
                    jsxMessageHandler(null, componentId);
                }
                handlers.reject(new Error(payload.message || 'Unknown Server Error'));
            } else if (type === USER.TOOL_CALL) {
                // Unwrap single-value tool call payloads for simpler consumer API
                const payloadKeys = Object.keys(payload);
                if (payloadKeys.length === 2 && payloadKeys.includes('componentId')) {
                    const otherKey = payloadKeys.find(key => key !== 'componentId');
                    handlers.resolve(payload[otherKey]);
                } else {
                    handlers.resolve(payload);
                }
            } else {
                handlers.resolve(payload)
            }
        } catch (he) {
            handlers.reject(new Error(he.message || 'Unknown RPC Error'));
        }
    });

    // Helper to register a typed message handler with debug logging and version tracking
    const setupHandler = (messageType, handler) => {
        socketInstance.on(messageType, (message) => {
            if (SOCKET_CONFIG.debug) {
                console.log(`WebSocket Message Received (${messageType}):`, message);
            }
            if (message?.version) {
                setBackendVersion(message.version);
            }
            handler(message);
        });
    };

    // --- Dynamic JSX handlers ---

    setupHandler(DYNAMIC_JSX.CONTENT, jsxMessageHandler);

    setupHandler(DYNAMIC_JSX.UPDATE, (message) => {
        setDynamicJSXContent(prev => {
            const currentContent = prev[message.payload.componentId];
            if (!currentContent) {
                console.warn(`No content found for component ID: ${message.payload.componentId}`);
                return prev;
            }

            return {
                ...prev, [message.payload.componentId]: {
                    ...currentContent, contextData: {
                        ...(prev[message.payload.componentId].contextData || {}),
                        ...(currentContent.contextData || {}),
                    }
                }
            };
        });
    });

    // --- Workspace handlers ---

    setupHandler(WORKSPACE.GET_WORKSPACES, (message) => {
        if (message.payload?.error?.message) {
            throw new Error(message.payload.message);
        }
        useWorkspaceStore.getState().setWorkspaces(message.payload);
    });

    setupHandler(WORKSPACE.GET_APPLICATIONS, (message) => {
        if (message.payload?.error?.message) {
            DEBUG_MODE && console.log(`Error on GET_APPLICATIONS: ${message.payload.error.message}`, message.payload);
            useWorkspaceStore.getState().setCurrentWorkspace(null);
            return;
        }
        useWorkspaceStore.getState().setApplications(message.payload);
    });

    // --- User handlers ---

    setupHandler(USER.GET_PROFILE, (message) => {
        if (message.payload?.error?.message) {
            throw new Error(message.payload.message);
        }
        useAuthStore.getState().setUserProfile(message.payload);
    });

    // --- Agent → frontend tool calls ---
    // Inverse of USER.TOOL_CALL (frontend→backend RPC). The supervisor agent
    // invokes a registered frontend tool by name; if a callId is provided we
    // emit AGENT.TOOL_RESULT with the return value (or error) so the agent
    // can await the outcome.
    setupHandler(AGENT.TOOL_CALL, async (message) => {
        const {toolName, args, callId} = message?.payload || {};
        DEBUG_MODE && console.log(`AGENT.TOOL_CALL: ${toolName}`, {args, callId});
        if (!toolName) {
            if (callId) {
                socketInstance.emit(AGENT.TOOL_RESULT, {
                    payload: {callId, error: 'AGENT.TOOL_CALL missing toolName'},
                });
            }
            return;
        }
        try {
            const result = await invokeAgentTool(toolName, args || {});
            if (callId) {
                socketInstance.emit(AGENT.TOOL_RESULT, {
                    payload: {callId, result},
                });
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            DEBUG_MODE && console.warn(`AGENT.TOOL_CALL "${toolName}" failed:`, errorMessage);
            if (callId) {
                socketInstance.emit(AGENT.TOOL_RESULT, {
                    payload: {callId, error: errorMessage},
                });
            }
        }
    });

    // --- Chat handlers ---

    setupHandler(CHAT.THREAD_LIST, (message) => {
        if (message.payload?.error?.message) {
            DEBUG_MODE && console.log("Error on THREAD_LIST:", message.payload.error.message);
            return;
        }
        setChatThreads(message.payload);
    });

    setupHandler(CHAT.HISTORY, (message) => {
        if (message.payload?.error?.message) {
            DEBUG_MODE && console.log("Error on CHAT_HISTORY:", message.payload.error.message);
            return;
        }

        const threadId = normalizeIncomingThreadId(message.payload?.threadId);
        if (threadId !== activeThreadIdRef.current) {
            DEBUG_MODE && console.log(`wsMsgHandler (HISTORY): threadId [${threadId}] and activeThreadId [${activeThreadIdRef.current}] mismatch`)
            return;
        }

        // The CHAT.HISTORY wire is now spec-native: the app-server history
        // handler runs each MemoryLayer record through the lossless
        // ``from_memorylayer_message`` codec, so every content part —
        // including ``todo`` — arrives verbatim and the board survives
        // reload. We only coerce envelope defaults / drop id-less entries.
        const spec = historyToSpecMessages(message.payload.messages);
        setSpecMessagesList && setSpecMessagesList(spec);
    });

    setupHandler(CHAT.APPEND_MESSAGE, (message) => {
        if (message.payload?.error?.message) {
            throw new Error(message.payload.message);
        }

        const threadId = normalizeIncomingThreadId(message.payload?.threadId);
        if (threadId !== activeThreadIdRef.current) {
            DEBUG_MODE && console.log(`wsMsgHandler (APPEND_MESSAGE): threadId [${threadId}] and activeThreadId [${activeThreadIdRef.current}] mismatch`)
            return;
        }

        const incoming = Array.isArray(message.payload.chatMessages)
            ? message.payload.chatMessages[0]
            : null;
        if (!incoming) return;
        upsertSpecMessage && upsertSpecMessage(legacyMessageToSpec(incoming));
    });

    setupHandler(CHAT.STREAM, (message) => {
        // Universal messaging-spec StreamEvent relay. Payload shape:
        //   {threadId: string, event: StreamEvent}
        // where event is one of message_started / part_appended /
        // token_delta / part_updated / message_finalized. The
        // dispatchSpecEvent action runs it through applyEvent() into
        // the specMessages map kept by useChatState.
        if (message.payload?.error?.message) {
            throw new Error(message.payload.error.message);
        }
        const threadId = normalizeIncomingThreadId(message.payload?.threadId);
        if (threadId !== activeThreadIdRef.current) {
            DEBUG_MODE && console.log(
                `wsMsgHandler (STREAM): threadId [${threadId}] and activeThreadId [${activeThreadIdRef.current}] mismatch`,
            );
            return;
        }
        const event = message.payload?.event;
        if (!event || typeof event !== 'object') return;
        dispatchSpecEvent && dispatchSpecEvent(event);
    });

    // --- Progress handlers ---

    setupHandler(USER.APP_PROGRESS, (message) => {
        if (message.payload?.error?.message) {
            throw new Error(message.payload.message);
        }
        useAppPanelStore.getState().setLatestAppStatus(message.payload);
    });

    setupHandler(CHAT.CHAT_PROGRESS, (message) => {
        // Non-chat-state progress (typing indicator detail). The
        // MessageProgress pill uses ``activeTaskByThread`` for visibility
        // and ``latestProgress.name`` only as a parenthetical detail
        // ("Thinking (Running Python)"). Cowork continues to emit this
        // event independently of CHAT_STREAM (Phase 3 left _chat_progress
        // orthogonal), so we keep the handler.
        if (message.payload?.error?.message) {
            throw new Error(message.payload.message);
        }

        const threadId = normalizeIncomingThreadId(message.payload?.threadId);
        if (threadId !== activeThreadIdRef.current) {
            DEBUG_MODE && console.log(`wsMsgHandler (CHAT_PROGRESS): threadId [${threadId}] and activeThreadId [${activeThreadIdRef.current}] mismatch`)
            return;
        }

        setLatestChatProgress(message.payload)
    });

    // chat_message task lifecycle (P3): drive the send-vs-cancel button state.
    // These events apply across all threads (the agent broadcasts to
    // ``us::{user}`` so every tab sees the lifecycle for every thread it
    // touches), so we don't filter by activeThreadIdRef like CHAT_PROGRESS
    // does — the per-thread dispatch happens via the threadId key.
    setupHandler(CHAT.MESSAGE_TASK_STARTED, (message) => {
        const p = message.payload || {};
        const threadId = normalizeIncomingThreadId(p.threadId);
        if (!p.taskId) {
            DEBUG_MODE && console.warn('MESSAGE_TASK_STARTED missing taskId', p);
            return;
        }
        setActiveChatTask && setActiveChatTask(threadId, {
            taskId: p.taskId,
            messageId: p.messageId || '',
            startedAt: p.startedAt || Date.now(),
        });
    });

    setupHandler(CHAT.MESSAGE_TASK_DONE, (message) => {
        const p = message.payload || {};
        const threadId = normalizeIncomingThreadId(p.threadId);
        if (p.taskId) clearActiveChatTask && clearActiveChatTask(threadId, p.taskId);
        DEBUG_MODE && console.log(
            `MESSAGE_TASK_DONE: thread=${threadId} task=${p.taskId} status=${p.status}`,
        );
    });

    // GET_ACTIVE_TASKS response — seeds activeTaskByThread on connect /
    // reconnect / workspace change. Payload is the {threadId: {taskId,
    // messageId, startedAt}} map returned by on_ws_get_active_tasks.
    setupHandler(CHAT.GET_ACTIVE_TASKS, (message) => {
        const p = message.payload || {};
        if (p.error?.message) {
            DEBUG_MODE && console.warn(
                'GET_ACTIVE_TASKS error:', p.error.message,
            );
            return;
        }
        // The dispatcher returns the map directly as payload (no wrapper).
        // Defensive: treat anything non-object as empty.
        const map = (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
        setActiveChatTasksMap && setActiveChatTasksMap(map);
    });

    // THREAD_AUTO_RENAMED — backend-initiated title update pushed by TitleMiddleware
    // after the first LLM exchange. Updates the thread name in the sidebar without
    // requiring a page refresh. Does NOT send a rename back to the server.
    setupHandler(CHAT.THREAD_AUTO_RENAMED, (message) => {
        const p = message.payload || {};
        const threadId = normalizeIncomingThreadId(p.threadId);
        const title = p.title;
        if (!title) return;
        renameThreadInList && renameThreadInList(threadId, title);
        DEBUG_MODE && console.log(
            `THREAD_AUTO_RENAMED: thread=${threadId} title=${title}`,
        );
    });
}
