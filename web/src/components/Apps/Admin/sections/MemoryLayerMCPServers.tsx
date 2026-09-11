import {TimeAgo} from '../_shared/TimeAgo';
import {isoTs, makePagedListSection, truncate} from './MemoryLayerShared';
import type {MLMcpServer} from '../types';

/** Cross-workspace MemoryLayer MCP servers (memorylayer.mcp_servers). Super-admin only. */
export const MemoryLayerMCPServersSection = makePagedListSection<MLMcpServer>({
    title: 'MemoryLayer MCP Servers',
    op: 'memorylayer.mcp_servers',
    rowKey: r => r.id,
    emptyTitle: 'No MCP servers',
    emptyDescription: 'No MCP servers match the current filters.',
    detail: {hashKey: 'mcp', op: 'memorylayer.mcp_server_detail', title: 'MCP server'},
    filters: [
        {key: 'workspace_id', label: 'Filter workspace', type: 'text', width: 'w-44'},
        {key: 'transport', label: 'Transport', type: 'text', width: 'w-32'},
    ],
    columns: [
        {key: 'name', label: 'Name'},
        {key: 'description', label: 'Description', render: r => truncate(r.description, 80)},
        {key: 'workspace_id', label: 'Workspace'},
        {key: 'user_id', label: 'User', render: r => r.user_id || '—'},
        {key: 'transport', label: 'Transport'},
        {key: 'enabled', label: 'Enabled', render: r => (r.enabled ? '✓' : '—')},
        {key: 'created_at', label: 'Created', render: r => <TimeAgo ts={isoTs(r.created_at)}/>},
    ],
});
