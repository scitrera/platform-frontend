import {TimeAgo} from '../_shared/TimeAgo';
import {formatBytes, isoTs, makePagedListSection, StatusBadge} from './MemoryLayerShared';
import type {MLDocument} from '../types';

/** Cross-workspace documents (memorylayer.documents). */
export const MemoryLayerDocumentsSection = makePagedListSection<MLDocument>({
    title: 'MemoryLayer Documents',
    op: 'memorylayer.documents',
    rowKey: r => r.id,
    emptyTitle: 'No documents',
    emptyDescription: 'No documents match the current filters.',
    sortableKeys: ['filename', 'size_bytes', 'created_at'],
    defaultSort: {key: 'created_at', dir: 'desc'},
    filters: [
        {key: 'workspace_id', label: 'Filter workspace', type: 'text', width: 'w-44'},
        {
            key: 'status', label: 'All statuses', type: 'select', width: 'w-40',
            options: ['pending', 'processing', 'completed', 'failed'],
        },
    ],
    columns: [
        {key: 'workspace_id', label: 'Workspace'},
        {key: 'filename', label: 'Filename', render: r => r.filename || '—'},
        {key: 'document_type', label: 'Type', render: r => r.document_type || '—'},
        {key: 'status', label: 'Status', render: r => <StatusBadge status={r.status}/>},
        {key: 'size_bytes', label: 'Size', render: r => formatBytes(r.size_bytes)},
        {key: 'page_count', label: 'Pages', render: r => String(r.page_count ?? 0)},
        {key: 'chunk_count', label: 'Chunks', render: r => String(r.chunk_count ?? 0)},
        {key: 'created_at', label: 'Created', render: r => <TimeAgo ts={isoTs(r.created_at)}/>},
    ],
});
