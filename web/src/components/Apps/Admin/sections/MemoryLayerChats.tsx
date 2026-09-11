import {TimeAgo} from '../_shared/TimeAgo';
import {isoTs, makePagedListSection, truncate} from './MemoryLayerShared';
import type {MLChatThread} from '../types';

/** Cross-workspace MemoryLayer chat threads (memorylayer.chats). Super-admin only. */
export const MemoryLayerChatsSection = makePagedListSection<MLChatThread>({
    title: 'MemoryLayer Chats',
    op: 'memorylayer.chats',
    rowKey: r => r.id,
    emptyTitle: 'No chat threads',
    emptyDescription: 'No chat threads match the current filters.',
    detail: {hashKey: 'chat', op: 'memorylayer.chat_detail', title: 'Chat thread'},
    filters: [
        {key: 'workspace_id', label: 'Filter workspace', type: 'text', width: 'w-44'},
        {key: 'ownership', label: 'Ownership', type: 'select', options: ['user', 'workspace']},
    ],
    columns: [
        {key: 'title', label: 'Title', render: r => truncate(r.title, 60)},
        {key: 'workspace_id', label: 'Workspace'},
        {key: 'user_id', label: 'User', render: r => r.user_id || '—'},
        {key: 'ownership', label: 'Ownership'},
        {key: 'scope', label: 'Scope'},
        {key: 'message_count', label: 'Msgs'},
        {key: 'hidden_at', label: 'Hidden', render: r => (r.hidden_at ? '✓' : '—')},
        {key: 'created_at', label: 'Created', render: r => <TimeAgo ts={isoTs(r.created_at)}/>},
    ],
});
