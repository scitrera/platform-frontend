import React, {createContext, useContext, useEffect, useState} from 'react';
import {DEBUG_MODE} from '../constants/AppConstants';
import {
    DEFAULT_THREAD_ID,
    type ActiveTaskByThread,
    type ActiveTaskInfo,
    type Attachment,
    type ChatDocument,
    type ChatThread,
    type ProgressUpdate,
} from '@/types/chat';
import type {
    ChatMessage as SpecChatMessage,
    StreamEvent,
} from '@scitrera/messaging-spec';
import {applyEvent, type MessageState as SpecMessageState} from '@scitrera/messaging-spec';
import {
    legacyMessageToSpec,
    specMessageText,
    type LegacyHistoryMessage,
} from '@/utils/messaging/specAdapters';
import {ArrivalOrder} from '@/utils/messaging/messageOrder';

// ─── Public context value ─────────────────────────────────────────────

export interface ChatStateValue {
    // attachments
    attachments: Attachment[];
    addAttachment: (attachment: Attachment) => void;
    removeAttachment: (id: string) => void;
    clearAttachments: () => void;
    setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
    getAttachments: () => Attachment[];
    // documents
    documents: ChatDocument[];
    addDocument: (doc: ChatDocument) => void;
    removeDocument: (id: string) => void;
    clearDocuments: () => void;
    getDocuments: () => ChatDocument[];
    // progress
    latestProgress: ProgressUpdate | null;
    setLatestProgress: React.Dispatch<React.SetStateAction<ProgressUpdate | null>>;
    clearProgress: () => void;
    /**
     * @deprecated Post chat-rail refactor: chat is user-session-scoped, so
     * workspace switches should no longer wipe chat state. This is kept
     * as a no-op to preserve the export contract for any latent caller.
     */
    resetForWorkspaceChange: () => void;
    // threads
    threads: ChatThread[];
    filteredThreads: ChatThread[];
    // Always a thread id — the default thread is ``DEFAULT_THREAD_ID``, never null.
    activeThreadId: string;
    setThreadsList: (threads: ChatThread[]) => void;
    createThread: (def: ChatThread) => string;
    /** Insert-or-update a thread by id (used to register subagent child
     *  threads on navigation without a full list refresh). */
    upsertThread: (thread: ChatThread) => void;
    deleteThread: (threadId: string) => void;
    selectThread: (threadId: string) => void;
    searchThreads: (searchTerm: string) => void;
    getActiveThread: () => ChatThread | null;
    updateThreadActivity: (threadId: string) => void;
    renameThreadInList: (threadId: string, title: string) => void;
    // chat_message task state
    activeTaskByThread: ActiveTaskByThread;
    setActiveChatTask: (threadId: string, info: ActiveTaskInfo) => void;
    clearActiveChatTask: (threadId: string, taskId?: string) => void;
    setActiveChatTasksMap: (map: ActiveTaskByThread | null | undefined) => void;
    getActiveChatTaskForThread: (threadId: string) => ActiveTaskInfo | null;
    // ── Universal messaging-spec stream state (Phase 4 — source of truth) ──
    //
    // Source-of-truth map of chat messages keyed by ``ChatMessage.id``.
    // Populated by:
    //   * ``CHAT_STREAM`` Socket.IO events → ``dispatchSpecEvent`` (live)
    //   * ``CHAT.HISTORY`` / ``CHAT.APPEND_MESSAGE`` payloads converted
    //     through ``legacyMessageToSpec`` (history reload + user echo)
    //   * ``upsertSpecMessage`` for outbound user input (optimistic
    //     insert at send-time).
    specMessages: SpecMessageState;
    /** Ordered list of spec ChatMessage values (oldest → newest by created_at). */
    specMessageList: SpecChatMessage[];
    dispatchSpecEvent: (event: StreamEvent) => void;
    clearSpecMessages: () => void;
    upsertSpecMessage: (msg: SpecChatMessage) => void;
    setSpecMessagesList: (msgs: SpecChatMessage[]) => void;
    beginSpecHistoryLoad: () => void;
    /** Replace the text content of the first ``text`` part on a spec msg. */
    editSpecMessageText: (msgId: string, newText: string) => void;
    /** Drop every spec message strictly after ``msgId``. Inclusive=false. */
    truncateSpecMessagesAfter: (msgId: string) => void;
    /** Drop ``msgId`` AND every message after it; returns the dropped text. */
    dropSpecMessageAndAfter: (msgId: string | undefined | null) => string;
    /**
     * Ephemeral (session-only) set of assistant message ids whose turn the user
     * cancelled AFTER the model had already responded. Drives the inline "Turn
     * cancelled" indicator; not persisted, so it clears on reload.
     */
    cancelledMessageIds: ReadonlySet<string>;
    /** Mark an assistant turn (by its message id) as user-cancelled. */
    markTurnCancelled: (messageId: string | undefined | null) => void;
}

const NOOP = () => {
    /* default placeholder */
};

const DEFAULT_CONTEXT: ChatStateValue = {
    attachments: [],
    addAttachment: NOOP,
    removeAttachment: NOOP,
    clearAttachments: NOOP,
    setAttachments: NOOP as ChatStateValue['setAttachments'],
    getAttachments: () => [],
    documents: [],
    addDocument: NOOP,
    removeDocument: NOOP,
    clearDocuments: NOOP,
    getDocuments: () => [],
    latestProgress: null,
    setLatestProgress: NOOP as ChatStateValue['setLatestProgress'],
    clearProgress: NOOP,
    resetForWorkspaceChange: NOOP,
    threads: [],
    filteredThreads: [],
    activeThreadId: DEFAULT_THREAD_ID,
    setThreadsList: NOOP,
    createThread: () => DEFAULT_THREAD_ID,
    upsertThread: NOOP,
    deleteThread: NOOP,
    selectThread: NOOP,
    searchThreads: NOOP,
    getActiveThread: () => null,
    updateThreadActivity: NOOP,
    renameThreadInList: NOOP,
    activeTaskByThread: {},
    setActiveChatTask: NOOP,
    clearActiveChatTask: NOOP,
    setActiveChatTasksMap: NOOP,
    getActiveChatTaskForThread: () => null,
    specMessages: {},
    specMessageList: [],
    dispatchSpecEvent: NOOP,
    clearSpecMessages: NOOP,
    upsertSpecMessage: NOOP,
    setSpecMessagesList: NOOP,
    beginSpecHistoryLoad: NOOP,
    editSpecMessageText: NOOP,
    truncateSpecMessagesAfter: NOOP,
    dropSpecMessageAndAfter: () => '',
    cancelledMessageIds: new Set<string>(),
    markTurnCancelled: NOOP,
};

const ChatAttachmentsContext = createContext<ChatStateValue>(DEFAULT_CONTEXT);

interface ChatStateProviderProps {
    children: React.ReactNode;
}

const DEFAULT_THREAD: ChatThread = {
    id: DEFAULT_THREAD_ID,
    name: 'Quick Chat',
    lastActivity: null,
};

/**
 * Provider component to wrap around the app — supplies chat state
 * (messages, threads, attachments, in-flight tasks) to descendants.
 */
export function ChatStateProvider({children}: ChatStateProviderProps) {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [documents, setDocuments] = useState<ChatDocument[]>([]);
    const [latestProgress, setLatestProgress] = useState<ProgressUpdate | null>(null);

    // Thread state
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string>(DEFAULT_THREAD_ID);
    const [filteredThreads, setFilteredThreads] = useState<ChatThread[]>([]);

    // In-flight chat_message tasks keyed by threadId. Each value is
    //   { taskId, messageId, startedAt }
    // Drives the send-vs-cancel button in MessageInput. Populated by:
    //   * CHAT_MSG_TASK_STARTED events from the backend (per-tab live)
    //   * CHAT_GET_ACTIVE_TASKS response on connect/reconnect (cross-tab seed)
    // Cleared by CHAT_MSG_TASK_DONE (terminal state).
    const [activeTaskByThread, setActiveTaskByThread] = useState<ActiveTaskByThread>({});

    // Universal messaging-spec stream state (Phase 4 — source of truth
    // for the chat rail). Populated by CHAT_STREAM events via
    // ``applyEvent`` and by the legacy-shape history/echo handlers via
    // ``upsertSpecMessage`` / ``setSpecMessagesList`` (which run the
    // payload through ``legacyMessageToSpec``).
    const [specMessages, setSpecMessages] = useState<SpecMessageState>({});
    // A history response is a snapshot taken before later stream events.
    // Keep messages changed after its request; reset the boundary on refresh
    // so authoritative history can replace state left behind by a disconnect.
    const liveSinceHistoryRequest = React.useRef(new Set<string>());

    // Live-transcript ordering. created_at can't be the sort key on the live
    // path: the optimistic user message is stamped with the CLIENT clock while
    // the assistant's message_started is server-stamped, so client→server clock
    // skew can sort the user's message AFTER the reply it triggered (history
    // reload is immune — both timestamps are server-domain there). Order by
    // first-seen arrival instead (causal + skew-proof); created_at only seeds a
    // bulk load and breaks ties. Ref so it persists across renders without
    // triggering one; assignment is idempotent.
    const arrivalRef = React.useRef<ArrivalOrder | null>(null);
    const arrival = (arrivalRef.current ??= new ArrivalOrder());

    // Ephemeral set of assistant message ids the user cancelled mid-turn (after
    // the model already responded). Session-only; drives the inline "Turn
    // cancelled" indicator and is never persisted.
    const [cancelledMessageIds, setCancelledMessageIds] = useState<ReadonlySet<string>>(() => new Set<string>());

    // Initialize with the default thread
    useEffect(() => {
        setThreads([DEFAULT_THREAD]);
        setActiveThreadId(DEFAULT_THREAD.id);
    }, []);

    // Update filtered threads when threads change
    useEffect(() => {
        setFilteredThreads(threads);
    }, [threads]);

    const addAttachment: ChatStateValue['addAttachment'] = (attachment) => {
        setAttachments(prev => {
            const exists = prev.some(a => a.id === attachment.id);
            DEBUG_MODE && exists && console.info(`addAttachment: skipping "${attachment.id}" because it already exists`);
            return exists ? prev : [...prev, attachment];
        });
    };

    const removeAttachment: ChatStateValue['removeAttachment'] = (id) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    const clearAttachments: ChatStateValue['clearAttachments'] = () => {
        setAttachments([]);
    };

    const getAttachments: ChatStateValue['getAttachments'] = () => attachments;

    const addDocument: ChatStateValue['addDocument'] = (doc) => {
        setDocuments(prev => {
            const exists = prev.some(a => a.id === doc.id);
            DEBUG_MODE && exists && console.info(`addDocument: skipping "${doc.id}" because it already exists`);
            return exists ? prev : [...prev, doc];
        });
    };

    const removeDocument: ChatStateValue['removeDocument'] = (id) => {
        setDocuments(prev => prev.filter(a => a.id !== id));
    };

    const clearDocuments: ChatStateValue['clearDocuments'] = () => {
        setDocuments([]);
    };

    const getDocuments: ChatStateValue['getDocuments'] = () => documents;

    const clearProgress: ChatStateValue['clearProgress'] = () => {
        setLatestProgress(null);
    };

    /**
     * @deprecated Post chat-rail refactor: chat is user-session-scoped, so
     * workspace switches no longer wipe chat state. Retained as a no-op
     * to keep the context contract stable for any latent caller.
     */
    const resetForWorkspaceChange: ChatStateValue['resetForWorkspaceChange'] = () => {
        /* no-op — chat state persists across workspace switches */
    };

    // ── chat_message task helpers ──────────────────────────────────────
    // ``threadId`` is always canonical (``DEFAULT_THREAD_ID`` for the default
    // thread), matching the backend, so it's used directly as the map key.
    const setActiveChatTask: ChatStateValue['setActiveChatTask'] = (threadId, info) => {
        setActiveTaskByThread(prev => {
            const previous = prev[threadId];
            if (previous?.startedAt && info.startedAt && previous.startedAt > info.startedAt) return prev;
            return {...prev, [threadId]: info};
        });
    };

    const clearActiveChatTask: ChatStateValue['clearActiveChatTask'] = (threadId, taskId) => {
        setActiveTaskByThread(prev => {
            if (!(threadId in prev) || (taskId && prev[threadId].taskId !== taskId)) return prev;
            const {[threadId]: _drop, ...rest} = prev;
            return rest;
        });
    };

    const setActiveChatTasksMap: ChatStateValue['setActiveChatTasksMap'] = (map) => {
        setActiveTaskByThread(map || {});
    };

    const getActiveChatTaskForThread: ChatStateValue['getActiveChatTaskForThread'] = (threadId) => {
        return activeTaskByThread[threadId] || null;
    };

    // ── Universal spec stream dispatch ─────────────────────────────────
    // Feeds the pure ``applyEvent`` reducer with the StreamEvent payload
    // from a CHAT_STREAM Socket.IO event. Unknown event kinds are
    // silently no-op'd by the reducer (forward-compat).
    const dispatchSpecEvent: ChatStateValue['dispatchSpecEvent'] = (event) => {
        if (!event || typeof event !== 'object') return;
        const messageId = 'message' in event ? event.message.id
            : 'message_id' in event ? event.message_id : null;
        if (messageId) liveSinceHistoryRequest.current.add(messageId);
        setSpecMessages(prev => applyEvent(prev, event));
        setLatestProgress(null);
    };

    const clearSpecMessages: ChatStateValue['clearSpecMessages'] = () => {
        liveSinceHistoryRequest.current.clear();
        setSpecMessages({});
    };

    const upsertSpecMessage: ChatStateValue['upsertSpecMessage'] = (msg) => {
        if (!msg || !msg.id) return;
        liveSinceHistoryRequest.current.add(msg.id);
        setSpecMessages(prev => ({...prev, [msg.id]: msg}));
        setLatestProgress(null);
    };

    const beginSpecHistoryLoad = () => {
        liveSinceHistoryRequest.current.clear();
    };

    const setSpecMessagesList: ChatStateValue['setSpecMessagesList'] = (msgs) => {
        const snapshot: Record<string, SpecChatMessage> = {};
        for (const m of msgs) {
            if (m?.id) snapshot[m.id] = m;
        }
        const liveIds = new Set(liveSinceHistoryRequest.current);
        setSpecMessages(prev => {
            const next = {...snapshot};
            for (const id of liveIds) {
                if (prev[id]) next[id] = prev[id];
            }
            return next;
        });
    };

    const editSpecMessageText: ChatStateValue['editSpecMessageText'] = (msgId, newText) => {
        if (!msgId) return;
        setSpecMessages(prev => {
            const existing = prev[msgId];
            if (!existing) return prev;
            let replaced = false;
            const content = existing.content.map(part => {
                if (replaced) return part;
                if (part.type === 'text') {
                    replaced = true;
                    return {...part, text: newText};
                }
                return part;
            });
            // No text part? Prepend one so the edit is visible.
            if (!replaced) {
                content.unshift({type: 'text', text: newText});
            }
            return {
                ...prev,
                [msgId]: {...existing, content, meta: {...existing.meta, edited: true}},
            };
        });
    };

    const truncateSpecMessagesAfter: ChatStateValue['truncateSpecMessagesAfter'] = (msgId) => {
        if (!msgId) return;
        setSpecMessages(prev => {
            const ordered = arrival.order(Object.values(prev));
            const idx = ordered.findIndex(m => m.id === msgId);
            if (idx < 0) return prev;
            const keep = ordered.slice(0, idx + 1);
            const next: Record<string, SpecChatMessage> = {};
            for (const m of keep) next[m.id] = m;
            return next;
        });
    };

    const dropSpecMessageAndAfter: ChatStateValue['dropSpecMessageAndAfter'] = (msgId) => {
        if (!msgId) {
            DEBUG_MODE && console.log('[CANCEL-DELETE-DIAG] dropSpecMessageAndAfter: no msgId');
            return '';
        }
        const ordered = arrival.order(Object.values(specMessages));
        const idx = ordered.findIndex(m => m.id === msgId);
        DEBUG_MODE && console.log(
            '[CANCEL-DELETE-DIAG] dropSpecMessageAndAfter: msgId=', msgId,
            ' idx=', idx,
            ' messageIdsInState=', ordered.map(m => m.id),
        );
        if (idx < 0) return '';
        const droppedText = specMessageText(ordered[idx]);
        setSpecMessages(prev => {
            const orderedNow = arrival.order(Object.values(prev));
            const i = orderedNow.findIndex(m => m.id === msgId);
            if (i < 0) return prev;
            const keep = orderedNow.slice(0, i);
            const next: Record<string, SpecChatMessage> = {};
            for (const m of keep) next[m.id] = m;
            return next;
        });
        return droppedText;
    };

    const markTurnCancelled: ChatStateValue['markTurnCancelled'] = (messageId) => {
        if (!messageId) return;
        setCancelledMessageIds(prev => {
            if (prev.has(messageId)) return prev;
            const next = new Set(prev);
            next.add(messageId);
            return next;
        });
    };

    // Ordered view derived from ``specMessages`` (oldest → newest) by first-seen
    // arrival (see ``arrival`` above): skew-proof on the live path, chronological
    // on a bulk load. ``arrival.order`` records any newly-seen ids as a side
    // effect — idempotent, so re-running on the same map is a no-op.
    const specMessageList = React.useMemo<SpecChatMessage[]>(
        () => arrival.order(Object.values(specMessages)),
        [specMessages, arrival],
    );

    // Thread management functions
    const setThreadsList: ChatStateValue['setThreadsList'] = (incoming) => {
        setThreads(prev => {
            // The backend list is top-level threads only. Preserve any
            // already-known sub-threads (children, registered on subagent
            // navigation) that aren't in this listing, so drilling into a
            // subagent thread survives a top-level list refresh.
            const incomingIds = new Set(incoming.map(t => t.id));
            const keptChildren = prev.filter(
                t => t.parentThreadId && !incomingIds.has(t.id),
            );
            // The server also lists the user's default thread: it materializes
            // to a per-user id server-side but de-materializes back to
            // DEFAULT_THREAD_ID on the wire, so it arrives with the SAME id as
            // our always-pinned "Quick Chat" entry. Fold it into that single
            // pinned row (keeping the server-side lastActivity) and drop the
            // duplicate — otherwise the list carries two DEFAULT_THREAD_ID rows
            // and React warns on the duplicate key.
            const serverDefault = incoming.find(t => t.id === DEFAULT_THREAD_ID);
            const pinnedDefault: ChatThread = serverDefault
                ? {...DEFAULT_THREAD, workProfile: serverDefault.workProfile, lastActivity: serverDefault.lastActivity ?? DEFAULT_THREAD.lastActivity}
                : DEFAULT_THREAD;
            const rest = incoming.filter(t => t.id !== DEFAULT_THREAD_ID);
            return [pinnedDefault, ...rest, ...keptChildren];
        });
    };

    const createThread: ChatStateValue['createThread'] = (def) => {
        DEBUG_MODE && console.log(`createThread(${JSON.stringify(def)})`);
        const newThread: ChatThread = {
            workProfile: def.workProfile,
            id: def.id,
            name: def.name,
            lastActivity: def.lastActivity ?? null,
        };
        setThreads(prev => [...prev, newThread]);
        setActiveThreadId(newThread.id);
        return newThread.id;
    };

    const upsertThread: ChatStateValue['upsertThread'] = (thread) => {
        setThreads(prev => {
            const idx = prev.findIndex(t => t.id === thread.id);
            if (idx === -1) return [...prev, thread];
            const next = [...prev];
            next[idx] = {...next[idx], ...thread};
            return next;
        });
    };

    const deleteThread: ChatStateValue['deleteThread'] = (threadId) => {
        setThreads(prev => prev.filter(thread => thread.id !== threadId));
    };

    const selectThread: ChatStateValue['selectThread'] = (threadId) => {
        DEBUG_MODE && console.log(`selectThread(${threadId})`);
        setActiveThreadId(threadId);
        setLatestProgress(null);
    };

    const searchThreads: ChatStateValue['searchThreads'] = (searchTerm) => {
        if (!searchTerm.trim()) {
            setFilteredThreads(threads);
        } else {
            const filtered = threads.filter(thread =>
                thread.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
            setFilteredThreads(filtered);
        }
    };

    const getActiveThread: ChatStateValue['getActiveThread'] = () =>
        threads.find(thread => thread.id === activeThreadId) || null;

    const updateThreadActivity: ChatStateValue['updateThreadActivity'] = (threadId) => {
        setThreads(prev => prev.map(thread =>
            thread.id === threadId
                ? {...thread, lastActivity: new Date()}
                : thread
        ));
    };

    /**
     * Update the name of a thread in the threads list. Used by the
     * THREAD_AUTO_RENAMED WS event handler to apply backend-generated
     * (LLM) titles without requiring a page refresh.
     */
    const renameThreadInList: ChatStateValue['renameThreadInList'] = (threadId, title) => {
        if (!threadId || !title) return;
        setThreads(prev => prev.map(thread =>
            thread.id === threadId
                ? {...thread, name: title}
                : thread
        ));
    };

    const value: ChatStateValue = {
        attachments,
        addAttachment,
        removeAttachment,
        clearAttachments,
        setAttachments,
        getAttachments,
        documents,
        addDocument,
        removeDocument,
        clearDocuments,
        getDocuments,
        latestProgress,
        setLatestProgress,
        clearProgress,
        resetForWorkspaceChange,
        threads,
        filteredThreads,
        activeThreadId,
        setThreadsList,
        createThread,
        upsertThread,
        deleteThread,
        selectThread,
        searchThreads,
        getActiveThread,
        updateThreadActivity,
        renameThreadInList,
        activeTaskByThread,
        setActiveChatTask,
        clearActiveChatTask,
        setActiveChatTasksMap,
        getActiveChatTaskForThread,
        specMessages,
        specMessageList,
        dispatchSpecEvent,
        clearSpecMessages,
        upsertSpecMessage,
        setSpecMessagesList,
        beginSpecHistoryLoad,
        editSpecMessageText,
        truncateSpecMessagesAfter,
        dropSpecMessageAndAfter,
        cancelledMessageIds,
        markTurnCancelled,
    };

    return (
        <ChatAttachmentsContext.Provider value={value}>
            {children}
        </ChatAttachmentsContext.Provider>
    );
}

/**
 * Hook to consume chat state.
 */
export function useChatState(): ChatStateValue {
    const context = useContext(ChatAttachmentsContext);
    if (!context) {
        throw new Error('useChatState must be used within a ChatStateProvider');
    }
    return context;
}

// Re-export the adapter for callers that need to inject a legacy-shape
// history payload into the spec map without going through the WS path.
export {legacyMessageToSpec, type LegacyHistoryMessage};
