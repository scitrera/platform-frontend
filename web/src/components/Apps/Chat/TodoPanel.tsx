import React, {memo, useEffect, useRef} from 'react';
import {CheckSquare, Square, ListChecks} from 'lucide-react';
import type {TodoItem, TodoStatus, TodoPart} from '@scitrera/messaging-spec';
import {cn} from '@/lib/utils';

// "Open" = work still outstanding. Unknown statuses count as open so a
// forward-compat status is still surfaced in the toggle's count.
export const isOpenStatus = (s: TodoStatus): boolean =>
    !(s === 'completed' || s === 'cancelled');

/** Count of not-yet-done items in a board (used for the toggle badge). */
export function openTodoCount(board: TodoPart | null | undefined): number {
    return (board?.items ?? []).filter(i => isOpenStatus(i.status as TodoStatus)).length;
}

// ─── One checklist row (pure render of a single TodoItem) ─────────────────
const TodoRow = memo(({item}: {item: TodoItem}) => {
    const status = item.status as TodoStatus;
    const inProgress = status === 'in_progress';
    const completed = status === 'completed';
    const cancelled = status === 'cancelled';

    // Prefer the present-tense active_form label while in progress.
    const label = (inProgress && item.active_form) ? item.active_form : item.content;

    const Icon = completed ? CheckSquare : Square;

    return (
        <li
            className={cn(
                'flex items-start gap-2 py-1 text-sm leading-snug transition-colors',
                inProgress && 'animate-todo-pulse',
            )}
        >
            <Icon
                size={15}
                className={cn(
                    'mt-0.5 shrink-0',
                    completed && 'text-gray-400',
                    cancelled && 'text-gray-300',
                    inProgress && 'text-blue-500',
                    !completed && !cancelled && !inProgress && 'text-gray-400',
                )}
                strokeWidth={inProgress ? 2.5 : 2}
                aria-hidden
            />
            <span
                className={cn(
                    'min-w-0 break-words',
                    completed && 'line-through text-gray-400',
                    cancelled && 'line-through text-gray-300',
                    inProgress && 'font-semibold text-gray-900',
                    !completed && !cancelled && !inProgress && 'text-gray-700',
                )}
            >
                {label}
            </span>
        </li>
    );
});
TodoRow.displayName = 'TodoRow';

// ─── Board content (header + list) shared by the unified sidebar and popout ─
export function TodoBoardBody({board}: {board: TodoPart | null}) {
    const items = board?.items ?? [];
    const total = items.length;
    const doneCount = items.filter(i => (i.status as TodoStatus) === 'completed').length;
    const title = (typeof board?.title === 'string' && board.title.trim())
        ? board.title.trim()
        : 'Tasks';

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center gap-2">
                <ListChecks size={16} className="text-blue-500"/>
                <h3 className="text-sm font-semibold text-gray-700">
                    {title}{' '}
                    {total > 0 && (
                        <span className="text-gray-400 font-normal tabular-nums">({doneCount}/{total})</span>
                    )}
                </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
                {total === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-8 px-3">
                        No tasks yet. The agent's checklist for this thread will appear here.
                    </div>
                ) : (
                    <ul>
                        {items.map((item, idx) => (
                            <TodoRow key={item.id ?? `todo_${idx}`} item={item}/>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

// ─── SIDEBAR mode: slide-in right overlay (mirrors ArtifactsPopout) ───────
export function TodoPopout({
    open,
    onClose,
    board,
}: {open: boolean; onClose: () => void; board: TodoPart | null}) {
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

    return (
        <div
            ref={panelRef}
            className={cn(
                'absolute top-0 right-0 bottom-0 z-20 w-72 bg-gray-50 border-l border-gray-200 shadow-md',
                'transition-transform duration-300 ease-in-out',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <TodoBoardBody board={board}/>
        </div>
    );
}
