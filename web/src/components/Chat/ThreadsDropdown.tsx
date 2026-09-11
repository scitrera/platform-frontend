import React, {useEffect, useRef, useState} from 'react';
import {Search, Plus, MessageCircle, CornerDownRight, Trash2} from 'lucide-react';
import {cn, timestampToString} from '@/lib/utils';
import {DEFAULT_THREAD_ID, type ChatThread} from '@/types/chat';

export interface ThreadsDropdownProps {
    open: boolean;
    onClose: () => void;
    threads: ChatThread[];
    activeThreadId: string;
    // Parent of the active thread when it's a subagent sub-thread; the
    // matching parent row is highlighted so the active subtree is obvious.
    activeParentThreadId?: string | null;
    onThreadSelect: (id: string) => void;
    onThreadCreate: (name: string) => void;
    onThreadDelete: (id: string) => void;
    onThreadSearch: (term: string) => void;
}

/**
 * Sidebar-mode threads overlay. Rolls down from beneath the chat header
 * to cover the messages area, leaving the input visible. Auto-closes on
 * thread select and click-outside (toggle buttons in the rail header
 * carry data-chat-rail-toggle so they're exempted from outside-clicks).
 */
export default function ThreadsDropdown({
    open,
    onClose,
    threads,
    activeThreadId,
    activeParentThreadId = null,
    onThreadSelect,
    onThreadCreate,
    onThreadDelete,
    onThreadSearch,
}: ThreadsDropdownProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (panelRef.current?.contains(target)) return;
            if (target.closest('[data-chat-rail-toggle]')) return;
            onClose();
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [open, onClose]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);
        onThreadSearch(value);
    };

    const handleCreateThread = () => {
        // Create the thread untitled (no name) so MemoryLayer auto-names it
        // after the first exchange; the row shows a display-only placeholder
        // until then.
        onThreadCreate('');
        onClose();
    };

    const handleSelect = (id: string) => {
        onThreadSelect(id);
        onClose();
    };

    const handleDelete = (id: string) => {
        setConfirmingDeleteId(null);
        onThreadDelete(id);
    };

    return (
        <div
            ref={panelRef}
            className={cn(
                'absolute top-0 left-0 right-0 z-20 bg-gray-50 border-b border-gray-200 shadow-md',
                'h-[min(60%,460px)] transition-transform duration-300 ease-in-out',
                open ? 'translate-y-0' : '-translate-y-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="h-full flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Activity Threads</h3>
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16}/>
                        <input
                            type="text"
                            placeholder="Search threads..."
                            value={searchTerm}
                            onChange={handleSearch}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleCreateThread}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors duration-200"
                    >
                        <Plus size={16}/>
                        New Thread
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {threads.length === 0 ? (
                        <div className="text-center text-sm text-gray-400 py-8">No threads yet</div>
                    ) : (
                        threads.map(thread => {
                            const isChild = Boolean(thread.parentThreadId);
                            const isActive = activeThreadId === thread.id;
                            const isActiveParent = activeParentThreadId != null
                                && thread.id === activeParentThreadId;
                            return (
                            <div
                                key={thread.id}
                                onClick={() => handleSelect(thread.id)}
                                className={cn(
                                    'flex items-center gap-3 p-3 mb-1 rounded-lg cursor-pointer group transition-colors duration-200',
                                    isChild && 'ml-4',
                                    isActive
                                        ? 'bg-blue-100 text-blue-800'
                                        : isActiveParent
                                            ? 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200'
                                            : 'hover:bg-gray-100 text-gray-700',
                                )}
                            >
                                {isChild
                                    ? <CornerDownRight size={16} className="flex-shrink-0 text-indigo-400"/>
                                    : <MessageCircle size={16} className="flex-shrink-0"/>}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">
                                        {thread.name ? thread.name : 'New chat'}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                        {thread.lastActivity
                                            ? timestampToString(
                                                  thread.lastActivity instanceof Date
                                                      ? thread.lastActivity.getTime()
                                                      : thread.lastActivity,
                                              )
                                            : ''}
                                    </div>
                                </div>
                                {thread.id !== DEFAULT_THREAD_ID && !isChild && (
                                    confirmingDeleteId === thread.id ? (
                                        <div
                                            className="flex items-center gap-1"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(thread.id)}
                                                className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                                                title="Confirm delete"
                                            >
                                                Yes
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmingDeleteId(null)}
                                                className="px-1.5 py-0.5 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                                                title="Cancel"
                                            >
                                                No
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConfirmingDeleteId(thread.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all duration-200"
                                            title="Delete thread"
                                        >
                                            <Trash2 size={14}/>
                                        </button>
                                    )
                                )}
                            </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
