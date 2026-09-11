import {TimeAgo} from '../_shared/TimeAgo';
import {isoTs, makePagedListSection} from './MemoryLayerShared';
import type {MLWorkspace} from '../types';

/**
 * MemoryLayer workspaces (memorylayer.workspaces). MemoryLayer has no admin
 * paginated workspaces endpoint, so the backend wraps the bare
 * ``GET /v1/workspaces`` list into the paged envelope; fields beyond id/name
 * are best-effort.
 */
export const MemoryLayerWorkspacesSection = makePagedListSection<MLWorkspace>({
    title: 'MemoryLayer Workspaces',
    op: 'memorylayer.workspaces',
    rowKey: r => r.id,
    emptyTitle: 'No workspaces',
    emptyDescription: 'MemoryLayer returned no workspaces for this tenant.',
    sortableKeys: ['id', 'name', 'created_at'],
    defaultSort: {key: 'name', dir: 'asc'},
    columns: [
        {key: 'id', label: 'ID', mono: true, render: r => r.id || '—'},
        {key: 'name', label: 'Name', render: r => r.name || '—'},
        {
            key: 'created_at', label: 'Created',
            render: r => (r.created_at ? <TimeAgo ts={isoTs(r.created_at)}/> : '—'),
        },
    ],
});
