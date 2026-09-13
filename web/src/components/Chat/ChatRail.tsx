import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useChatRailStore, type ChatRailState} from '@/stores/chatRailStore';
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useWebSocket} from '../../hooks/useWebSocket.jsx';
import {useChatState} from '../../hooks/useChatState';
import {CHAT} from '../../constants/WebSocketConstants.jsx';
import {UI_CONSTANTS} from '../../constants/AppConstants';
import {cn} from '@/lib/utils';
import {DEFAULT_THREAD_ID, type ChatThread} from '@/types/chat';
import {useWorkspaceHomedThreads} from '@/hooks/useThreadMode';
import {useToasts} from '@/hooks/useToasts';
import ChatBody from './ChatBody';
import ChatRailHeader from './ChatRailHeader';
import ChatRailLauncher from './ChatRailLauncher';

const {CHAT_RAIL_MOBILE_BREAKPOINT, APP_ID_SELECT_WORKSPACE_PROMPT} = UI_CONSTANTS;

const DRAG_HANDLE_WIDTH = 6; // matches Tailwind w-1.5
const TRANSITION_MS = 300;

/**
 * Track a CSS media query via window.matchMedia. Returns the current
 * match state and updates on viewport changes.
 */
function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mql = window.matchMedia(query);
        const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
        setMatches(mql.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);

    return matches;
}

/**
 * Layout-level chat rail. Three states:
 *   - COLLAPSED: a thin right-edge launcher button.
 *   - SIDEBAR: a drag-resizable column on the right edge; AppArea takes
 *     the rest of the row.
 *   - FULLSCREEN: rail expands to 100% width of the row; AppArea is
 *     squeezed out (still mounted but width=0 behind the rail). Width
 *     transitions smoothly between sidebar and fullscreen.
 *
 * Auto-fullscreen: when the user is in SIDEBAR but neither the primary
 * nor secondary AppArea slot is populated, the rail auto-promotes to
 * FULLSCREEN. As soon as an app opens in either slot, the rail snaps
 * back to SIDEBAR. The stored preference is preserved — only the
 * effective render is overridden.
 */
export default function ChatRail() {
    const storedState = useChatRailStore(s => s.state);
    const width = useChatRailStore(s => s.width);
    const setWidth = useChatRailStore(s => s.setWidth);
    const setState = useChatRailStore(s => s.setState);
    const maximize = useChatRailStore(s => s.maximize);

    const uiConfig = useAuthStore(s => s.uiConfig);
    const chatEnabled = (uiConfig as Record<string, unknown>).chatEnabled !== false;
    // By default the "Clear conversation" button is offered only for the default
    // thread. ``allowClearAnyThread`` opens it for ANY thread — pairs with
    // workspaceAsThread so a user can clear the workspace's chat.
    const allowClearAnyThread = (uiConfig as Record<string, unknown>).allowClearAnyThread === true;
    // Clear must target the same storage the thread was written to — in
    // workspace-homed mode that's the workspace-owned thread, not _user_chat.
    const workspaceHomed = useWorkspaceHomedThreads();

    const mainPanel = useAppPanelStore(s => s.main);
    const secondaryPanel = useAppPanelStore(s => s.secondary);

    const {activeThreadId, clearSpecMessages, createThread, deleteThread} = useChatState();
    const {addToast} = useToasts();
    const {sendRpcRequest} = useWebSocket();

    const isMobile = useMediaQuery(`(max-width: ${CHAT_RAIL_MOBILE_BREAKPOINT - 1}px)`);

    // "No apps open" = the main slot is empty / placeholder AND no secondary app.
    // The select-workspace prompt counts as empty since it's only a placeholder.
    const noAppsOpen = useMemo(() => {
        const noMain = !mainPanel || mainPanel.id === APP_ID_SELECT_WORKSPACE_PROMPT;
        return noMain && !secondaryPanel;
    }, [mainPanel, secondaryPanel]);

    // Effective render state:
    //   - 'collapsed' is always honored (user explicitly hid chat).
    //   - 'fullscreen' is always honored (user explicitly maximized).
    //   - 'sidebar' auto-promotes to 'fullscreen' when noAppsOpen — this is
    //     the headline behavior: empty workspace → chat takes the screen.
    //   - On mobile, sidebar is effectively fullscreen so the rail isn't cramped.
    const effectiveState: ChatRailState = useMemo(() => {
        if (storedState === 'collapsed') return 'collapsed';
        if (storedState === 'fullscreen') return 'fullscreen';
        if (isMobile) return 'fullscreen';
        return noAppsOpen ? 'fullscreen' : 'sidebar';
    }, [storedState, noAppsOpen, isMobile]);

    const isFullscreen = effectiveState === 'fullscreen';

    // Context-aware minimize: from auto-fullscreen-due-to-no-apps, going to
    // sidebar would just snap back to fullscreen, so we skip straight to
    // collapsed. From explicit fullscreen with apps open, go to sidebar.
    const handleMinimize = useCallback(() => {
        if (effectiveState === 'fullscreen') {
            // If the user is in fullscreen *because* there are no apps open,
            // a sidebar would just re-auto-fullscreen. Collapse instead.
            if (noAppsOpen) {
                setState('collapsed');
            } else {
                setState('sidebar');
            }
        } else if (effectiveState === 'sidebar') {
            setState('collapsed');
        }
    }, [effectiveState, noAppsOpen, setState]);

    // Drag handle plumbing — left edge of the rail. Dragging left widens.
    const isDraggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartWidthRef = useRef(width);
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const deltaX = e.clientX - dragStartXRef.current;
        // Dragging left = negative deltaX = larger rail.
        setWidth(dragStartWidthRef.current - deltaX);
    }, [setWidth]);

    const handleMouseUp = useCallback(() => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const handleDragHandleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isFullscreen) return;
        e.preventDefault();
        isDraggingRef.current = true;
        dragStartXRef.current = e.clientX;
        dragStartWidthRef.current = width;
        setIsDragging(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    // Handler shared with header — reads current workspace at fire-time.
    const handleReset = useCallback(() => {
        const wsId = useWorkspaceStore.getState().currentWorkspaceId;
        void sendRpcRequest<{thread?: ChatThread}>(CHAT.CLEAR, {
            workspace: wsId, threadId: activeThreadId, workspaceScoped: workspaceHomed,
        }).then(response => {
            clearSpecMessages();
            if (response.thread) {
                deleteThread(activeThreadId);
                createThread(response.thread);
                const panels = useAppPanelStore.getState();
                panels.updateAppUrl({query: {
                    ...(panels.appQueryParams as Record<string, string>), thread: response.thread.id,
                }});
            }
        }).catch(() => addToast('Could not clear the conversation. Please try again.', 'error'));
    }, [sendRpcRequest, activeThreadId, clearSpecMessages, createThread, deleteThread, workspaceHomed, addToast]);

    if (!chatEnabled) return null;

    if (effectiveState === 'collapsed') {
        return <ChatRailLauncher/>;
    }

    // SIDEBAR or FULLSCREEN — same DOM, different widths, transition between.
    // Drag handle hidden via opacity + zero-width collapse in fullscreen so
    // AppArea isn't blocked behind it.
    return (
        <div
            className={cn(
                'h-full flex flex-row flex-shrink-0 overflow-hidden',
                !isDragging && 'transition-[width] ease-in-out',
            )}
            style={{
                width: isFullscreen ? '100%' : `${width + DRAG_HANDLE_WIDTH}px`,
                transitionDuration: isDragging ? '0ms' : `${TRANSITION_MS}ms`,
            }}
        >
            <div
                onMouseDown={handleDragHandleMouseDown}
                title="Drag to resize chat"
                role="separator"
                aria-orientation="vertical"
                className={cn(
                    'flex-shrink-0 cursor-col-resize bg-gray-200 hover:bg-gray-400 transition-all duration-300',
                    isFullscreen ? 'w-0 opacity-0 pointer-events-none' : 'w-1.5 opacity-100',
                )}
            />
            <div className="flex-grow flex flex-col h-full border-l border-gray-200 bg-white min-w-0">
                <ChatRailHeader
                    effectiveState={effectiveState}
                    onMinimize={handleMinimize}
                    onMaximize={maximize}
                    onReset={handleReset}
                    showReset={allowClearAnyThread || activeThreadId === DEFAULT_THREAD_ID}
                />
                <ChatBody isFullscreen={isFullscreen}/>
            </div>
        </div>
    );
}
