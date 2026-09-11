import {TimeAgo} from '../_shared/TimeAgo';
import {isoTs, makePagedListSection, StatusBadge, truncate} from './MemoryLayerShared';
import type {MLMemory} from '../types';

/** Cross-workspace memories (memorylayer.memories). */
export const MemoryLayerMemoriesSection = makePagedListSection<MLMemory>({
    title: 'MemoryLayer Memories',
    op: 'memorylayer.memories',
    rowKey: r => r.id,
    emptyTitle: 'No memories',
    emptyDescription: 'No memories match the current filters.',
    // Show active memories by default; "All statuses" reveals archived/etc.
    defaultFilters: {status: 'active'},
    // Sort the current page by importance or created (client-side).
    sortableKeys: ['importance', 'created_at'],
    defaultSort: {key: 'created_at', dir: 'desc'},
    filters: [
        {key: 'workspace_id', label: 'Filter workspace', type: 'text', width: 'w-44'},
        {
            key: 'status', label: 'All statuses', type: 'select', width: 'w-36',
            options: ['active', 'archived'],
        },
    ],
    columns: [
        {key: 'workspace_id', label: 'Workspace'},
        {key: 'type', label: 'Type', render: r => r.type || '—'},
        {key: 'importance', label: 'Importance', render: r => (r.importance ?? 0).toFixed(2)},
        {
            key: 'content', label: 'Content', className: 'max-w-md',
            render: r => <span title={r.content}>{truncate(r.content)}</span>,
        },
        {key: 'status', label: 'Status', render: r => <StatusBadge status={r.status}/>},
        {key: 'created_at', label: 'Created', render: r => <TimeAgo ts={isoTs(r.created_at)}/>},
    ],
});
