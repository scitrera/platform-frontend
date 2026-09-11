import {TimeAgo} from '../_shared/TimeAgo';
import {formatBytes, isoTs, makePagedListSection, StatusBadge} from './MemoryLayerShared';
import type {MLDataset} from '../types';

/** Cross-workspace datasets (memorylayer.datasets). */
export const MemoryLayerDatasetsSection = makePagedListSection<MLDataset>({
    title: 'MemoryLayer Datasets',
    op: 'memorylayer.datasets',
    rowKey: r => r.id,
    emptyTitle: 'No datasets',
    emptyDescription: 'No datasets match the current filters.',
    sortableKeys: ['name', 'row_count', 'size_bytes', 'created_at'],
    defaultSort: {key: 'created_at', dir: 'desc'},
    filters: [
        {key: 'workspace_id', label: 'Filter workspace', type: 'text', width: 'w-44'},
        {
            key: 'status', label: 'All statuses', type: 'select', width: 'w-40',
            options: ['pending', 'profiling', 'completed', 'failed'],
        },
    ],
    columns: [
        {key: 'workspace_id', label: 'Workspace'},
        {key: 'name', label: 'Name', render: r => r.name || r.filename || '—'},
        {key: 'format', label: 'Format', render: r => r.format || '—'},
        {key: 'status', label: 'Status', render: r => <StatusBadge status={r.status}/>},
        {key: 'row_count', label: 'Rows', render: r => String(r.row_count ?? 0)},
        {key: 'column_count', label: 'Cols', render: r => String(r.column_count ?? 0)},
        {key: 'size_bytes', label: 'Size', render: r => formatBytes(r.size_bytes)},
        {key: 'created_at', label: 'Created', render: r => <TimeAgo ts={isoTs(r.created_at)}/>},
    ],
});
