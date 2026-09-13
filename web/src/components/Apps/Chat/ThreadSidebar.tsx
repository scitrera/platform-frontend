import WorkProfileSelect from '@/components/Chat/WorkProfileSelect';
import React, {useState} from 'react';
import {Search, Plus, MessageCircle, CornerDownRight, Trash2, ChevronLeft, ChevronRight} from 'lucide-react';
import {timestampToString} from '../../../lib/utils';
import {DEFAULT_THREAD_ID, type ChatThread, type WorkProfileOption} from '@/types/chat';

export interface ThreadSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    threads: ChatThread[];
    activeThreadId: string;
    // Parent of the active thread when it's a subagent sub-thread; the
    // matching parent row is highlighted so the active subtree is obvious.
    activeParentThreadId?: string | null;
    onThreadSelect: (id: string) => void;
    onThreadCreate: (name: string) => void;
    workProfiles?: WorkProfileOption[];
    newWorkProfile?: string;
    onWorkProfileChange?: (value: string) => void;
    onThreadDelete: (id: string) => void;
    onThreadSearch: (term: string) => void;
    uiConfig?: Record<string, unknown>;
}

export default function ThreadSidebar({
    isOpen,
    onToggle,
    threads,
    activeThreadId,
    activeParentThreadId = null,
    onThreadSelect,
    onThreadCreate,
    workProfiles = [],
    newWorkProfile = '',
    onWorkProfileChange = () => {},
    onThreadDelete,
    onThreadSearch,
}: ThreadSidebarProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

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
    };

    const handleDeleteThread = (threadId: string) => {
        setConfirmingDeleteId(null);
        onThreadDelete(threadId);
    };

    return (
        <div className={`bg-gray-50 border-r border-gray-200 transition-all duration-300 flex-shrink-0 ${
            isOpen ? 'w-64' : 'w-0'
        }`}>
            {/* Toggle Button */}
            <div className="absolute z-10 top-4 -right-8">
                <button
                    onClick={onToggle}
                    className="bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-r-md p-1 shadow-sm transition-colors duration-200"
                    title={isOpen ? 'Close sidebar' : 'Open sidebar'}
                >
                    {isOpen ? <ChevronLeft size={16}/> : <ChevronRight size={16}/>}
                </button>
            </div>

            {/* Sidebar Content */}
            <div className={`h-full flex flex-col overflow-hidden ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
                {/* Header */}
                <div className="p-4 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Activity Threads</h3>

                    {/* Search */}
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

                    {/* New Thread Button */}
                    <WorkProfileSelect profiles={workProfiles} value={newWorkProfile} onChange={onWorkProfileChange}/>
                    <button
                        onClick={handleCreateThread}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors duration-200"
                    >
                        <Plus size={16}/>
                        New Thread
                    </button>
                </div>

                {/* Thread List */}
                <div className="flex-1 overflow-y-auto p-2">
                    {threads.length === 0 ? (
                        <div className="text-center text-sm text-gray-400 py-8">
                            No threads yet
                        </div>
                    ) : (
                        threads.map(thread => {
                            const isChild = Boolean(thread.parentThreadId);
                            const isActive = activeThreadId === thread.id;
                            const isActiveParent = activeParentThreadId != null
                                && thread.id === activeParentThreadId;
                            return (
                            <div
                                key={thread.id}
                                onClick={() => onThreadSelect(thread.id)}
                                className={`flex items-center gap-3 p-3 mb-1 rounded-lg cursor-pointer group transition-colors duration-200 ${
                                    isChild ? 'ml-4' : ''
                                } ${
                                    isActive
                                        ? 'bg-blue-100 text-blue-800'
                                        : isActiveParent
                                            ? 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200'
                                            : 'hover:bg-gray-100 text-gray-700'
                                }`}
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
                                                    : Number(thread.lastActivity)
                                            )
                                            : ''}
                                    </div>
                                </div>
                                {thread.id !== DEFAULT_THREAD_ID && !isChild && (
                                    confirmingDeleteId === thread.id ? (
                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => handleDeleteThread(thread.id)}
                                                className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                                                title="Confirm delete"
                                            >
                                                Yes
                                            </button>
                                            <button
                                                onClick={() => setConfirmingDeleteId(null)}
                                                className="px-1.5 py-0.5 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                                                title="Cancel"
                                            >
                                                No
                                            </button>
                                        </div>
                                    ) : (
                                        <button
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
