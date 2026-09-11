import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useWebSocket} from '../../hooks/useWebSocket.jsx';
import {useAuthStore} from '@/stores/authStore';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useChatRailStore} from '@/stores/chatRailStore';
import {CHAT} from '../../constants/WebSocketConstants.jsx';
import {DEBUG_MODE, CHAT_UI_CONSTANTS} from '@/constants/AppConstants';
import {useChatState} from '@/hooks/useChatState';
import {useShowThreadSelector, useWorkspaceAsThread, useWorkspaceHomedThreads} from '@/hooks/useThreadMode';
import {MessageItem} from '../Apps/Chat/MessageItem';
import {MessageInput} from '../Apps/Chat/MessageInput';
import {MessageProgress} from '../Apps/Chat/MessageProgress';
import {TodoPopout, openTodoCount} from '../Apps/Chat/TodoPanel';
import ThreadSidebar from '../Apps/Chat/ThreadSidebar';
import RightSidebar from '../Apps/Chat/RightSidebar';
import ThreadsDropdown from './ThreadsDropdown';
import ArtifactsPopout from './ArtifactsPopout';
import ChatContextChip from './ChatContextChip';
import WelcomeGreeting from './WelcomeGreeting';
import {extractArtifacts} from '@/utils/artifactExtractor';
import {feedbackToSpecMessage, latestTodoBoard} from '@/utils/messaging/specAdapters';
import {DEFAULT_THREAD_ID, type ChatThread} from '@/types/chat';
import {useToasts} from '@/hooks/useToasts.jsx';

const {MAX_WIDTH_CLASS} = CHAT_UI_CONSTANTS;

// ── Thread ↔ URL boundary ──────────────────────────────────────────────
// The URL is the ONLY place the frontend represents the default thread as
// anything other than DEFAULT_THREAD_ID: it renders as a blank ``thread``
// query param for a cleaner URL. Every other id passes through verbatim.
const threadToUrlParam = (threadId: string): string =>
    threadId === DEFAULT_THREAD_ID ? '' : threadId;
const threadFromUrlParam = (raw: string | null | undefined): string =>
    (raw == null || raw === '' || raw === 'null') ? DEFAULT_THREAD_ID : raw;

// Coerce a thread's ``lastActivity`` (MemoryLayer ``updated_at`` — bumped on
// every message append, so it tracks last usage, not creation) to epoch ms for
// sorting. Handles Date, epoch number, ISO string, or missing (→ 0, sinks to
// the bottom) so the sort is robust to the wire format.
const threadActivityMs = (thread: ChatThread): number => {
    const v = thread.lastActivity;
    if (v == null) return 0;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    const parsed = Date.parse(v);
    return Number.isNaN(parsed) ? 0 : parsed;
};

export interface ChatBodyProps {
    isFullscreen: boolean;
}

/**
 * Chat body extracted from the old ChatApp. Reads workspace + main panel
 * directly from the stores (no props) so the rail survives workspace and
 * app switches.
 *
 * Phase 4: chat messages come from the universal messaging-spec ``specMessages``
 * map (populated by CHAT_STREAM events and legacy-shape history echoes
 * funneled through ``legacyMessageToSpec``). The legacy ``chatMessages /
 * WorkingMessage`` plumbing is gone.
 *
 * Workspace-switch behavior: the three workspace-dependent effects
 * (HISTORY / THREAD_LIST / GET_ACTIVE_TASKS) intentionally drop
 * workspaceId from their dependency arrays and read it via getState()
 * at fire-time. They re-fire only on connect transitions and active-
 * thread changes — switching workspaces no longer re-fetches history.
 */
export default function ChatBody({isFullscreen}: ChatBodyProps) {
    const {sendMessage: sendWsMessage, isConnected, sendRpcRequest} = useWebSocket();
    const {addToast} = useToasts();
    const {
        specMessageList,
        clearSpecMessages,
        latestProgress,
        filteredThreads,
        activeThreadId,
        createThread,
        deleteThread,
        selectThread,
        searchThreads,
        getActiveThread,
        cancelledMessageIds,
    } = useChatState();
    const uiConfig = useAuthStore(s => s.uiConfig);
    const mainPanel = useAppPanelStore(s => s.main);
    const appQueryParams = useAppPanelStore(s => s.appQueryParams);
    const updateAppUrl = useAppPanelStore(s => s.updateAppUrl);
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);

    // "Workspace as thread" mode: one implicit thread per workspace — the
    // selector is hidden and the active thread is pinned to the workspace id
    // (see the thread-resolution effect + MessageInput below).
    const workspaceAsThread = useWorkspaceAsThread();
    const showThreadSelector = useShowThreadSelector();
    // "Workspace-homed threads" mode: threads are owned per-workspace. Every
    // chat WS request carries workspaceScoped so the backend routes ownership to
    // the real workspace, and the thread list + history re-fetch on workspace
    // switch (see the effects below). Multi-thread, so the selector stays shown.
    const workspaceHomed = useWorkspaceHomedThreads();

    const threadsOpen = useChatRailStore(s => s.threadsOpen);
    const artifactsOpen = useChatRailStore(s => s.artifactsOpen);
    const todosOpen = useChatRailStore(s => s.todosOpen);
    const setTodosOpen = useChatRailStore(s => s.setTodosOpen);
    const toggleThreads = useChatRailStore(s => s.toggleThreads);
    const setThreadsOpen = useChatRailStore(s => s.setThreadsOpen);
    const setArtifactsOpen = useChatRailStore(s => s.setArtifactsOpen);

    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const chatContainerRef = useRef<HTMLDivElement | null>(null);
    const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevMessageLengthRef = useRef(0);
    // Mirror isScrolling into a ref so the scroll-listener can read the
    // current value without re-binding on every render. Without this,
    // smooth scrollIntoView fires scroll events that flip userScrolledUp
    // to true mid-animation and break the next auto-stick.
    const isScrollingRef = useRef(false);
    const [, setIsScrolling] = useState(false);
    const [userScrolledUp, setUserScrolledUp] = useState(false);

    // Per-message DOM refs so the artifacts sidebar can scroll to a message.
    // A Map (not state) avoids re-renders when entries are added/removed.
    const messageRefs = useRef<Map<string, HTMLElement>>(new Map());
    const registerMessageRef = useCallback((id: string, el: HTMLElement | null) => {
        if (el) messageRefs.current.set(id, el);
        else messageRefs.current.delete(id);
    }, []);

    // Derived list of artifacts for the right sidebar. Cheap because
    // specMessageList is already in memory; recompute is bounded by message count.
    const artifacts = useMemo(() => extractArtifacts(specMessageList), [specMessageList]);

    // The live agent TODO board (latest 'todo' part in the thread).
    const todoBoard = useMemo(() => latestTodoBoard(specMessageList), [specMessageList]);
    const todoTotal = todoBoard?.items?.length ?? 0;
    // Auto-open the tasks sidebar once when the FIRST item appears in a thread
    // (mirrors the old bottom panel's auto-surface); after that it's a manual
    // toggle. Reset the baseline on thread switch so switching threads never
    // auto-opens — only a new first item does.
    const todoBaselineRef = useRef<{threadId: string; total: number}>({threadId: activeThreadId, total: todoTotal});
    useEffect(() => {
        const prev = todoBaselineRef.current;
        if (prev.threadId !== activeThreadId) {
            todoBaselineRef.current = {threadId: activeThreadId, total: todoTotal};
            return;
        }
        // Auto-surface the first task — but never STEAL the shared slot from an
        // artifacts view the user opened. The task count still shows on the
        // collapsed and header toggles, so it's one click away.
        if (prev.total === 0 && todoTotal > 0 && !artifactsOpen) {
            setTodosOpen(true);
        }
        todoBaselineRef.current = {threadId: activeThreadId, total: todoTotal};
    }, [activeThreadId, todoTotal, artifactsOpen, setTodosOpen]);

    // Function to force scroll to bottom.
    //
    // ``behavior`` defaults to 'smooth'. Streaming-token bursts pass
    // 'auto' (instant) to avoid a queue of overlapping smooth animations
    // racing each other — the visible motion still looks smooth because
    // the bursts are 30 tokens / 200ms apart.
    const scrollToBottom = (returnLambda: boolean = false, behavior: ScrollBehavior = 'smooth') => {
        if (scrollTimerRef.current) {
            clearTimeout(scrollTimerRef.current);
        }

        setIsScrolling(true);
        isScrollingRef.current = true;
        messagesEndRef.current?.scrollIntoView({behavior, block: 'end'});
        setUserScrolledUp(false);

        if (returnLambda) {
            return () => {
                setIsScrolling(false);
                isScrollingRef.current = false;
                if (scrollTimerRef.current) {
                    clearTimeout(scrollTimerRef.current);
                }
            };
        }

        scrollTimerRef.current = setTimeout(() => {
            setIsScrolling(false);
            isScrollingRef.current = false;
        }, behavior === 'smooth' ? 300 : 50);
    };

    // Smooth-scroll to a specific message by id (artifacts sidebar entry-point).
    const scrollToMessage = useCallback((msgId: string) => {
        const el = messageRefs.current.get(msgId);
        if (!el) return;
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        setIsScrolling(true);
        isScrollingRef.current = true;
        el.scrollIntoView({behavior: 'smooth', block: 'center'});
        scrollTimerRef.current = setTimeout(() => {
            setIsScrolling(false);
            isScrollingRef.current = false;
            setUserScrolledUp(true);
        }, 400);
    }, []);

    // Determine context app (the "main" app that the chat is annotating).
    const contextAppConfig = mainPanel || null;
    const contextAppId = contextAppConfig?.id;
    // contextAppTitle is no longer surfaced inline (the context chip reads
    // the panel directly), but the lookup stays here for clarity.
    void contextAppConfig?.title;

    // Detect when user scrolls up manually.
    useEffect(() => {
        const chatContainer = chatContainerRef.current;
        if (!chatContainer) return;

        const handleScroll = () => {
            if (isScrollingRef.current) return;
            const isAtBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
            setUserScrolledUp(!isAtBottom);
        };

        chatContainer.addEventListener('scroll', handleScroll, {passive: true});
        return () => chatContainer.removeEventListener('scroll', handleScroll);
    }, []);

    // Sticky-bottom auto-scroll.
    useEffect(() => {
        const prevLength = prevMessageLengthRef.current;
        const currentLength = specMessageList.length;
        const isLoadingFromZero = prevLength === 0 && currentLength > 0;
        const lengthGrew = currentLength > prevLength;
        prevMessageLengthRef.current = currentLength;

        if (isLoadingFromZero) {
            scrollToBottom(false, 'smooth');
            return;
        }

        if (userScrolledUp) {
            return;
        }

        scrollToBottom(false, lengthGrew ? 'smooth' : 'auto');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [specMessageList, latestProgress, userScrolledUp]);

    // --- Message action handlers ---

    const handleFeedback = useCallback((msgId: string, feedbackType: 'up' | 'down' | null) => {
        const wsId = useWorkspaceStore.getState().currentWorkspaceId;
        // Spec-only wire shape (no legacy {messageId, feedback} payload).
        // The carrier is a universal spec ChatMessage with a single
        // FeedbackPart targeting ``msgId``; the backend persists it to
        // MemoryLayer via ``on_ws_chat_feedback``. Convention:
        //   'up'   → sentiment = +1
        //   'down' → sentiment = -1
        //   null   → sentiment =  0  (user cleared their prior feedback)
        const sentiment = feedbackType === 'up' ? 1 : feedbackType === 'down' ? -1 : 0;
        const specMessage = feedbackToSpecMessage({
            targetMessageId: msgId,
            sentiment,
        });
        sendWsMessage(CHAT.FEEDBACK, {
            workspace: wsId,
            threadId: activeThreadId,
            message: specMessage,
            workspaceScoped: workspaceHomed,
        });
    }, [sendWsMessage, activeThreadId, workspaceHomed]);

    // Thread management handlers
    const handleThreadCreate = (name: string) => {
        const wsId = useWorkspaceStore.getState().currentWorkspaceId;
        return sendRpcRequest<ChatThread>(CHAT.THREAD_ADD, {
            name,
            workspaceId: wsId,
            workspaceScoped: workspaceHomed,
        }).then((response) => {
            const newThreadId = createThread(response);
            clearSpecMessages();
            updateAppUrl({
                query: {...(appQueryParams as Record<string, string>), thread: threadToUrlParam(newThreadId)},
            });
        }, (error: unknown) => {
            console.error('Failed to create thread:', error);
            addToast('Failed to create thread. Please try again.', 'error');
        });
    };

    const handleThreadSelect = (threadId: string) => {
        // Re-selecting the active thread is a no-op: clearing here would wipe
        // the transcript without changing activeThreadId, so the history-fetch
        // effect wouldn't re-fire to repopulate it (→ blank view).
        if (threadId === activeThreadId) return;
        // Clear the current transcript up front so the switch is immediate and
        // never shows the previous thread's content while the new thread's
        // history loads (the CHAT.HISTORY response then populates it).
        clearSpecMessages();
        selectThread(threadId);

        updateAppUrl({
            query: {...(appQueryParams as Record<string, string>), thread: threadToUrlParam(threadId)},
        });
    };

    const handleThreadDelete = (threadId: string) => {
        const wsId = useWorkspaceStore.getState().currentWorkspaceId;
        return sendRpcRequest<{result?: boolean}>(CHAT.THREAD_DELETE, {
            workspaceId: wsId,
            threadId,
            workspaceScoped: workspaceHomed,
        }).then((response) => {
            if (response.result) {
                if (threadId === activeThreadId) {
                    clearSpecMessages();
                }
                deleteThread(threadId);
                handleThreadSelect(DEFAULT_THREAD_ID);
            }
        }, (error: unknown) => {
            console.error('Failed to delete thread:', error);
            addToast('Failed to delete thread. Please try again.', 'error');
        });
    };

    const handleArtifactSelect = useCallback((messageId: string) => {
        scrollToMessage(messageId);
    }, [scrollToMessage]);

    // Tracks the workspace the workspace-homed reset last ran for, so the reset
    // fires only on an actual workspace switch (not on every effect re-run).
    const prevHomedWorkspaceRef = useRef<string | null | undefined>(currentWorkspaceId);

    // Sync the active thread FROM the URL query param (mount, browser
    // back/forward, deep-link, and once the thread list loads a deep-linked
    // thread). This is the URL→state direction only; the state→URL direction
    // is handled by handleThreadSelect. ``activeThreadId`` is intentionally NOT
    // a dependency: if it were, selecting a thread (which flips activeThreadId
    // before updateAppUrl's param propagates) would re-fire this effect against
    // the STALE param and revert the selection — the "switching to Quick Chat
    // shows the previous thread" bug.
    useEffect(() => {
        // Workspace-as-thread: the active thread IS the current workspace, so
        // ignore the URL ?thread param entirely and re-pin on every workspace
        // switch (currentWorkspaceId is in the deps). Falls back to the default
        // thread when no workspace is selected (e.g. Home). Clear the transcript
        // up front on an actual change so the switch never shows the previous
        // workspace's messages while the new history loads (mirrors
        // handleThreadSelect); the CHAT.HISTORY effect then repopulates it.
        if (workspaceAsThread) {
            const pinned = currentWorkspaceId || DEFAULT_THREAD_ID;
            if (pinned !== activeThreadId) {
                clearSpecMessages();
                selectThread(pinned);
            }
            return;
        }

        // Workspace-homed threads: threads are per-workspace, so the
        // cross-workspace URL ?thread param doesn't apply. On an actual
        // workspace switch (ref mismatch) drop to that workspace's default
        // thread + clear the transcript; the THREAD_LIST/HISTORY effects then
        // refetch for the new workspace. The ref guard means in-workspace thread
        // selection (handleThreadSelect) is never clobbered.
        if (workspaceHomed) {
            if (prevHomedWorkspaceRef.current !== currentWorkspaceId) {
                prevHomedWorkspaceRef.current = currentWorkspaceId;
                if (activeThreadId !== DEFAULT_THREAD_ID) {
                    clearSpecMessages();
                    selectThread(DEFAULT_THREAD_ID);
                }
            }
            return;
        }
        prevHomedWorkspaceRef.current = currentWorkspaceId;

        const qp = appQueryParams as Record<string, string> | URLSearchParams | null;
        let rawThreadFromQuery: string | null | undefined;
        if (qp instanceof URLSearchParams) rawThreadFromQuery = qp.get('thread');
        else rawThreadFromQuery = qp?.thread;

        // Threads disabled, or a blank/absent param, both mean the default thread.
        if (!Boolean(uiConfig.enableThreads) || rawThreadFromQuery == null || rawThreadFromQuery === '' || rawThreadFromQuery === 'null') {
            selectThread(DEFAULT_THREAD_ID);
            return;
        }
        const threadFromQuery = threadFromUrlParam(rawThreadFromQuery);
        DEBUG_MODE && console.log(`effect: threadId from query string: ${threadFromQuery}`);
        if (threadFromQuery !== activeThreadId) {
            const threadExists = filteredThreads.some(thread => thread.id === threadFromQuery);
            if (threadExists) {
                selectThread(threadFromQuery);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [(appQueryParams as Record<string, string> | null)?.thread, filteredThreads, workspaceAsThread, workspaceHomed, currentWorkspaceId]);

    // Fetch history when connection or thread changes. In the default
    // (user-scoped) mode a workspace switch does NOT re-fetch — chat spans
    // workspaces. In workspace-homed mode threads ARE per-workspace, so the
    // conditional currentWorkspaceId dep re-fires the fetch on switch (and
    // workspaceScoped routes the read to the workspace-owned thread).
    useEffect(() => {
        if (!isConnected) return;
        const wsId = useWorkspaceStore.getState().currentWorkspaceId;
        if (!wsId) return;
        sendWsMessage(CHAT.HISTORY, {workspace: wsId, threadId: activeThreadId, workspaceScoped: workspaceHomed});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, sendWsMessage, activeThreadId, workspaceHomed, workspaceHomed ? currentWorkspaceId : null]);

    // Update the threads list on connection changes (only when the selector is
    // shown — skipped in workspace-as-threads mode, where there is no list). In
    // workspace-homed mode the list is per-workspace, so re-fetch on switch.
    useEffect(() => {
        if (!isConnected || !showThreadSelector) return;
        const wsId = useWorkspaceStore.getState().currentWorkspaceId;
        if (!wsId) return;
        sendWsMessage(CHAT.THREAD_LIST, {workspaceId: wsId, threadId: activeThreadId, workspaceScoped: workspaceHomed});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, sendWsMessage, showThreadSelector, workspaceHomed, workspaceHomed ? currentWorkspaceId : null]);

    // Fetch the user's in-flight chat_message tasks so this tab knows
    // which threads are currently mid-stream (cross-tab consistency).
    useEffect(() => {
        if (!isConnected) return;
        const wsId = useWorkspaceStore.getState().currentWorkspaceId;
        if (!wsId) return;
        sendWsMessage(CHAT.GET_ACTIVE_TASKS, {workspace: wsId});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, sendWsMessage]);

    // When the active thread is a subagent sub-thread it carries a
    // ``parentThreadId`` (registered on navigation from the parent's subagent
    // link). The sidebar surfaces it nested under its parent (and highlights
    // the parent), so the user can see which sub-thread they're in.
    const activeThread = getActiveThread();
    const activeParentThreadId = activeThread?.parentThreadId ?? null;

    // The Activity Threads sidebar lists top-level threads, with any known
    // subagent sub-threads (registered on navigation, so they carry a
    // parentThreadId) nested one level directly beneath their parent. Ordering
    // each parent immediately followed by its children lets the flat list
    // renderer draw the hierarchy via per-row indentation.
    const sidebarThreads = filteredThreads
        .filter(t => !t.parentThreadId)
        // Most-recently-used first (by lastActivity = MemoryLayer updated_at),
        // with the default "Quick Chat" thread always pinned to the top.
        .sort((a, b) => {
            if (a.id === DEFAULT_THREAD_ID) return -1;
            if (b.id === DEFAULT_THREAD_ID) return 1;
            return threadActivityMs(b) - threadActivityMs(a);
        })
        .flatMap(parent => [
            parent,
            ...filteredThreads.filter(c => c.parentThreadId === parent.id),
        ]);

    return (
        <div className="flex-grow flex overflow-hidden bg-gray-50 min-h-0">
            {/* FULLSCREEN: inline left thread sidebar (with horizontal room to spare).
                SIDEBAR mode renders threads as a roll-down dropdown inside the
                messages region below. */}
            {showThreadSelector && isFullscreen && (
                <div className="relative">
                    <ThreadSidebar
                        isOpen={threadsOpen}
                        onToggle={toggleThreads}
                        threads={sidebarThreads}
                        activeParentThreadId={activeParentThreadId}
                        activeThreadId={activeThreadId}
                        onThreadSelect={handleThreadSelect}
                        onThreadCreate={handleThreadCreate}
                        onThreadDelete={handleThreadDelete}
                        onThreadSearch={searchThreads}
                        uiConfig={uiConfig}
                    />
                </div>
            )}

            {/* Chat Area */}
            <div className="flex-grow flex flex-col overflow-hidden min-w-0">
                {/* Messages region — wrapped so the sidebar-mode overlays
                    (ThreadsDropdown, ArtifactsPopout) can anchor here and
                    cover only the messages, leaving the input visible. */}
                <div className="flex-grow relative overflow-hidden">
                    <div className="absolute inset-0 overflow-y-auto" ref={chatContainerRef}>
                        <div className={`${MAX_WIDTH_CLASS} w-full mx-auto p-4 space-y-4 bg-white min-h-full`}>
                            {!isConnected &&
                                <div className="text-center text-xs text-red-500 py-2">Disconnected. Reconnecting...</div>}
                            {specMessageList.length === 0 && isConnected && (
                                <WelcomeGreeting/>
                            )}
                            {specMessageList.map(msg => (
                                <MessageItem
                                    key={msg.id}
                                    msg={msg}
                                    cancelled={cancelledMessageIds.has(msg.id)}
                                    onFeedback={handleFeedback}
                                    registerRef={registerMessageRef}
                                />
                            ))}
                            <MessageProgress/>
                            <div ref={messagesEndRef}/>
                        </div>
                    </div>

                    {/* SIDEBAR-mode overlays: threads rolls down from the top;
                        artifacts pops out from the right. Both auto-close on
                        selection / click-outside. */}
                    {!isFullscreen && showThreadSelector && (
                        <ThreadsDropdown
                            open={threadsOpen}
                            onClose={() => setThreadsOpen(false)}
                            threads={sidebarThreads}
                            activeParentThreadId={activeParentThreadId}
                            activeThreadId={activeThreadId}
                            onThreadSelect={handleThreadSelect}
                            onThreadCreate={handleThreadCreate}
                            onThreadDelete={handleThreadDelete}
                            onThreadSearch={searchThreads}
                        />
                    )}
                    {!isFullscreen && (
                        <ArtifactsPopout
                            open={artifactsOpen}
                            onClose={() => setArtifactsOpen(false)}
                            artifacts={artifacts}
                            onArtifactSelect={handleArtifactSelect}
                        />
                    )}

                    {/* SIDEBAR mode: the agent TODO checklist slides in as a
                        right overlay (mirrors ArtifactsPopout). Fullscreen uses
                        the inline sidebar below. */}
                    {!isFullscreen && (
                        <TodoPopout
                            open={todosOpen}
                            onClose={() => setTodosOpen(false)}
                            board={todoBoard}
                        />
                    )}
                </div>
                <ChatContextChip/>
                <MessageInput
                    workspaceId={currentWorkspaceId}
                    contextAppId={contextAppId}
                    threadId={activeThreadId}
                    scrollToBottom={scrollToBottom}
                />
            </div>

            {/* FULLSCREEN: one right-hand slot shared by artifacts + tasks
                (mutual exclusion is enforced in the chat-rail store, so only one
                fills it at a time). */}
            {isFullscreen && (
                <div className="relative">
                    <RightSidebar
                        activePanel={artifactsOpen ? 'artifacts' : todosOpen ? 'todos' : null}
                        artifacts={artifacts}
                        board={todoBoard}
                        artifactCount={artifacts.length}
                        openTaskCount={openTodoCount(todoBoard)}
                        onOpenArtifacts={() => setArtifactsOpen(true)}
                        onOpenTodos={() => setTodosOpen(true)}
                        onClose={() => {
                            setArtifactsOpen(false);
                            setTodosOpen(false);
                        }}
                        onArtifactSelect={handleArtifactSelect}
                    />
                </div>
            )}
        </div>
    );
}
