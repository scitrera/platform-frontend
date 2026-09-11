import {
    Trash2,
    MessageSquare,
    Package,
    ListChecks,
    Maximize2,
    Minimize2,
    PanelRightClose,
} from 'lucide-react';
import {useChatRailStore, type ChatRailState} from '@/stores/chatRailStore';
import {useShowThreadSelector} from '@/hooks/useThreadMode';
import {useChatState} from '@/hooks/useChatState';
import {latestTodoBoard} from '@/utils/messaging/specAdapters';
import {openTodoCount} from '../Apps/Chat/TodoPanel';

export interface ChatRailHeaderProps {
    /**
     * Rendered state of the rail (after auto-fullscreen promotion). Drives
     * which state-toggle buttons appear. 'collapsed' is excluded because
     * the header isn't rendered in that case.
     */
    effectiveState: Exclude<ChatRailState, 'collapsed'>;
    onMinimize: () => void;
    onMaximize: () => void;
    onReset: () => void;
    showReset: boolean;
    contextTitle?: string;
    contextAppTitle?: string;
}

interface IconButtonProps {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    /**
     * Adds `data-chat-rail-toggle=<id>` to the button so the sidebar-mode
     * threads/artifacts popouts can ignore outside-clicks that target it
     * (otherwise click-outside-to-dismiss would race the toggle's onClick).
     */
    toggleId?: string;
}

function IconButton({onClick, title, children, toggleId}: IconButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            data-chat-rail-toggle={toggleId}
            className="p-1.5 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-800 transition-colors"
        >
            {children}
        </button>
    );
}

/**
 * Slim rail header. Layout:
 *   [Title] [Threads]                [Artifacts] [Reset?] [spacer] [State buttons]
 *
 * The threads toggle lives on the left next to the title (separated from
 * the right-side controls). A wider spacer sits between the artifacts /
 * reset cluster and the rail-state buttons so it's harder to misclick a
 * destructive state change.
 */
export default function ChatRailHeader({
    effectiveState,
    onMinimize,
    onMaximize,
    onReset,
    showReset,
    contextTitle = 'Chat',
    contextAppTitle,
}: ChatRailHeaderProps) {
    const toggleThreads = useChatRailStore(s => s.toggleThreads);
    const toggleArtifacts = useChatRailStore(s => s.toggleArtifacts);
    const toggleTodos = useChatRailStore(s => s.toggleTodos);
    // Hidden in workspace-as-threads mode (and when threads are disabled) — the
    // thread selector it opens doesn't exist there.
    const showThreadSelector = useShowThreadSelector();

    // Live open-task count for the tasks toggle badge.
    const {specMessageList} = useChatState();
    const openTasks = openTodoCount(latestTodoBoard(specMessageList));

    return (
        <div className="p-4 border-b border-gray-200 bg-gray-50 shadow-sm flex-shrink-0 flex justify-between items-center gap-2">
            {/* Left cluster: title + threads toggle */}
            <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-base font-semibold text-gray-700 truncate">
                    {contextTitle}
                    {contextAppTitle && (
                        <span className="text-xs font-normal text-gray-500 ml-2">
                            (Context: {contextAppTitle})
                        </span>
                    )}
                </h2>
                {showThreadSelector && (
                    <IconButton onClick={toggleThreads} title="Toggle threads" toggleId="threads">
                        <MessageSquare size={16}/>
                    </IconButton>
                )}
            </div>

            {/* Right cluster: artifacts → reset → spacer → state buttons */}
            <div className="flex items-center gap-1">
                <span className="relative inline-flex" data-chat-rail-toggle="todos">
                    <IconButton onClick={toggleTodos} title="Toggle tasks" toggleId="todos">
                        <ListChecks size={16}/>
                    </IconButton>
                    {openTasks > 0 && (
                        <span className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-semibold leading-[15px] text-center tabular-nums">
                            {openTasks}
                        </span>
                    )}
                </span>
                <IconButton onClick={toggleArtifacts} title="Toggle artifacts" toggleId="artifacts">
                    <Package size={16}/>
                </IconButton>
                {showReset && (
                    <IconButton onClick={onReset} title="Clear conversation">
                        <Trash2 size={16}/>
                    </IconButton>
                )}
                {/* Spacer — makes the state buttons visually separated from the
                    routine toggles, so accidental clicks on Max/Min/Collapse
                    while reaching for Artifacts are less likely. */}
                <div className="w-6" aria-hidden="true"/>
                {effectiveState === 'sidebar' && (
                    <>
                        <IconButton onClick={onMaximize} title="Maximize chat">
                            <Maximize2 size={16}/>
                        </IconButton>
                        <IconButton onClick={onMinimize} title="Collapse chat">
                            <PanelRightClose size={16}/>
                        </IconButton>
                    </>
                )}
                {effectiveState === 'fullscreen' && (
                    <IconButton onClick={onMinimize} title="Restore chat sidebar">
                        <Minimize2 size={16}/>
                    </IconButton>
                )}
            </div>
        </div>
    );
}
