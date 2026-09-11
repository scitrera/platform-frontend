import {TimeAgo} from '../_shared/TimeAgo';
import {isoTs, makePagedListSection, truncate} from './MemoryLayerShared';
import type {MLSkill} from '../types';

/** Cross-workspace MemoryLayer skills (memorylayer.skills). Super-admin only. */
export const MemoryLayerSkillsSection = makePagedListSection<MLSkill>({
    title: 'MemoryLayer Skills',
    op: 'memorylayer.skills',
    rowKey: r => r.id,
    emptyTitle: 'No skills',
    emptyDescription: 'No skills match the current filters.',
    detail: {hashKey: 'skill', op: 'memorylayer.skill_detail', title: 'Skill'},
    filters: [
        {key: 'workspace_id', label: 'Filter workspace', type: 'text', width: 'w-44'},
    ],
    columns: [
        {key: 'name', label: 'Name'},
        {key: 'description', label: 'Description', render: r => truncate(r.description, 80)},
        {key: 'workspace_id', label: 'Workspace'},
        {key: 'user_id', label: 'User', render: r => r.user_id || '—'},
        {key: 'version', label: 'Version'},
        {key: 'source_mode', label: 'Source'},
        {key: 'enabled', label: 'Enabled', render: r => (r.enabled ? '✓' : '—')},
        {key: 'created_at', label: 'Created', render: r => <TimeAgo ts={isoTs(r.created_at)}/>},
    ],
});
