import {TimeAgo} from '../_shared/TimeAgo';
import {isoTs, makePagedListSection, StatusBadge} from './MemoryLayerShared';
import type {MLJob} from '../types';

/** Cross-workspace ingestion jobs (memorylayer.jobs). */
export const MemoryLayerJobsSection = makePagedListSection<MLJob>({
    title: 'MemoryLayer Ingestion Jobs',
    op: 'memorylayer.jobs',
    rowKey: r => r.id,
    emptyTitle: 'No jobs',
    emptyDescription: 'No ingestion jobs match the current filters.',
    filters: [
        {key: 'workspace_id', label: 'Filter workspace', type: 'text', width: 'w-44'},
        {
            key: 'status', label: 'All statuses', type: 'select', width: 'w-36',
            options: ['queued', 'running', 'completed', 'failed', 'cancelled'],
        },
    ],
    columns: [
        {key: 'workspace_id', label: 'Workspace'},
        {key: 'job_type', label: 'Type', render: r => <StatusBadge status={r.job_type}/>},
        {key: 'status', label: 'Status', render: r => <StatusBadge status={r.status}/>},
        {key: 'progress_percent', label: 'Progress', render: r => `${r.progress_percent ?? 0}%`},
        {key: 'created_at', label: 'Created', render: r => <TimeAgo ts={isoTs(r.created_at)}/>},
        {
            key: 'started_at', label: 'Started',
            render: r => (r.started_at ? <TimeAgo ts={isoTs(r.started_at)}/> : '—'),
        },
        {
            key: 'completed_at', label: 'Completed',
            render: r => (r.completed_at ? <TimeAgo ts={isoTs(r.completed_at)}/> : '—'),
        },
    ],
});
