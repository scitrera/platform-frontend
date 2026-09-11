import {TimeAgo} from '../_shared/TimeAgo';
import {isoTs, makePagedListSection} from './MemoryLayerShared';
import type {MLSession} from '../types';

/** Cross-workspace MemoryLayer sessions (memorylayer.sessions). */
export const MemoryLayerSessionsSection = makePagedListSection<MLSession>({
    title: 'MemoryLayer Sessions',
    op: 'memorylayer.sessions',
    rowKey: r => r.id,
    emptyTitle: 'No sessions',
    emptyDescription: 'No MemoryLayer sessions match the current filters.',
    filters: [
        {key: 'workspace_id', label: 'Filter workspace', type: 'text', width: 'w-44'},
    ],
    columns: [
        {key: 'workspace_id', label: 'Workspace'},
        {key: 'user_id', label: 'User', render: r => r.user_id || '—'},
        {key: 'context_id', label: 'Context', mono: true, render: r => r.context_id || '—'},
        {key: 'auto_commit', label: 'Auto-commit', render: r => (r.auto_commit ? '✓' : '—')},
        {key: 'created_at', label: 'Created', render: r => <TimeAgo ts={isoTs(r.created_at)}/>},
        {key: 'expires_at', label: 'Expires', render: r => <TimeAgo ts={isoTs(r.expires_at)}/>},
    ],
});
