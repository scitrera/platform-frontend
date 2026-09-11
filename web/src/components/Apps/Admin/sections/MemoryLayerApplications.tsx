import {TimeAgo} from '../_shared/TimeAgo';
import {isoTs, makePagedListSection, truncate} from './MemoryLayerShared';
import type {MLApplication} from '../types';

/** Registered applications (memorylayer.applications, tenant-scoped). Super-admin only. */
export const MemoryLayerApplicationsSection = makePagedListSection<MLApplication>({
    title: 'MemoryLayer Applications',
    op: 'memorylayer.applications',
    rowKey: r => r.id,
    emptyTitle: 'No applications',
    emptyDescription: 'No applications are registered for this tenant.',
    detail: {hashKey: 'app', op: 'memorylayer.application_detail', title: 'Application'},
    columns: [
        {key: 'name', label: 'Name'},
        {key: 'description', label: 'Description', render: r => truncate(r.description, 80)},
        {key: 'app_type', label: 'Type'},
        {key: 'enabled', label: 'Enabled', render: r => (r.enabled ? '✓' : '—')},
        {key: 'skill_count', label: 'Skills'},
        {key: 'mcp_server_count', label: 'MCP'},
        {key: 'tool_count', label: 'Tools'},
        {key: 'created_at', label: 'Created', render: r => <TimeAgo ts={isoTs(r.created_at)}/>},
    ],
});
