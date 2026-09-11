import React, {useRef} from 'react';
import {ChevronRight, ListChecks, Package} from 'lucide-react';
import type {TodoPart} from '@scitrera/messaging-spec';
import {cn} from '@/lib/utils';
import type {Artifact} from '@/utils/artifactExtractor';
import {ArtifactListBody} from './ArtifactList';
import {TodoBoardBody} from './TodoPanel';

// A single right-hand sidebar slot shared by the Artifacts and Tasks panels
// (fullscreen chat). Only one panel occupies the slot at a time — opening one
// displaces the other (enforced in the chat-rail store) — so the two never
// stack. Collapsed, the slot shows one edge icon-button per panel (Package /
// ListChecks, each with a count) to open it; expanded, a single chevron
// collapses it. Switching panels while open slides the content up/down.

export type RightPanel = 'artifacts' | 'todos';

export interface RightSidebarProps {
    /** The panel filling the slot, or null when collapsed. */
    activePanel: RightPanel | null;
    artifacts: Artifact[];
    board: TodoPart | null;
    artifactCount: number;
    openTaskCount: number;
    onOpenArtifacts: () => void;
    onOpenTodos: () => void;
    onClose: () => void;
    onArtifactSelect: (messageId: string) => void;
}

const EDGE_BTN =
    'bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-l-md p-1 shadow-sm transition-colors duration-200 flex items-center';

function EdgeButton({
    onClick,
    title,
    toggleId,
    children,
}: {
    onClick: () => void;
    title: string;
    toggleId?: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={EDGE_BTN}
            title={title}
            data-chat-rail-toggle={toggleId}
        >
            {children}
        </button>
    );
}

export default function RightSidebar({
    activePanel,
    artifacts,
    board,
    artifactCount,
    openTaskCount,
    onOpenArtifacts,
    onOpenTodos,
    onClose,
    onArtifactSelect,
}: RightSidebarProps) {
    const isOpen = activePanel !== null;
    // Remember the last shown panel so the slide track keeps its position while
    // the slot collapses (the outgoing content stays put behind the fade-out
    // instead of jumping to the other panel).
    const lastPanelRef = useRef<RightPanel>('artifacts');
    if (activePanel) lastPanelRef.current = activePanel;
    const shown = activePanel ?? lastPanelRef.current;

    return (
        <div className={cn(
            // h-full so the absolutely-positioned content panels (inset-0) have a
            // definite height to fill — without it the content box collapses to 0
            // (absolute children contribute no in-flow height) and nothing shows.
            'h-full bg-gray-50 border-l border-gray-200 transition-all duration-300 flex-shrink-0 relative',
            isOpen ? 'w-64' : 'w-0',
        )}>
            {/* Edge controls — pinned to the slot's left edge (mirrors the thread
                sidebar handle on the opposite side). Collapsed: one icon-button
                per panel; open: a single collapse chevron. */}
            <div className="absolute z-10 top-4 -left-8 flex flex-col gap-2">
                {isOpen ? (
                    <EdgeButton onClick={onClose} title="Collapse" toggleId="right-sidebar">
                        <ChevronRight size={16}/>
                    </EdgeButton>
                ) : (
                    <>
                        <EdgeButton
                            onClick={onOpenArtifacts}
                            title={`Artifacts${artifactCount ? ` (${artifactCount})` : ''}`}
                            toggleId="artifacts"
                        >
                            <Package size={16}/>
                            {artifactCount > 0 && (
                                <span className="ml-1 mr-0.5 text-[10px] font-semibold text-gray-700">{artifactCount}</span>
                            )}
                        </EdgeButton>
                        <EdgeButton
                            onClick={onOpenTodos}
                            title={`Tasks${openTaskCount ? ` (${openTaskCount})` : ''}`}
                            toggleId="todos"
                        >
                            <ListChecks size={16}/>
                            {openTaskCount > 0 && (
                                <span className="ml-1 mr-0.5 text-[10px] font-semibold text-blue-600">{openTaskCount}</span>
                            )}
                        </EdgeButton>
                    </>
                )}
            </div>

            {/* Content — the two panels are stacked absolutely (each exactly the
                slot height) and slid by ±100% of their OWN height so switching
                animates up/down with no sub-pixel bleed of the off-screen panel
                (a percentage track rounds and leaves a hairline showing).
                Mounted only while open so image thumbnails aren't built for a
                hidden slot; the fade covers the open/close transition. */}
            <div className={cn(
                'h-full overflow-hidden relative transition-opacity duration-300',
                isOpen ? 'opacity-100' : 'opacity-0',
            )}>
                {isOpen && (
                    <>
                        <div
                            className="absolute inset-0 transition-transform duration-300 ease-in-out"
                            style={{transform: shown === 'todos' ? 'translateY(-100%)' : 'translateY(0)'}}
                        >
                            <ArtifactListBody artifacts={artifacts} onArtifactSelect={onArtifactSelect}/>
                        </div>
                        <div
                            className="absolute inset-0 transition-transform duration-300 ease-in-out"
                            style={{transform: shown === 'todos' ? 'translateY(0)' : 'translateY(100%)'}}
                        >
                            <TodoBoardBody board={board}/>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
