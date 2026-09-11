import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import type {WorkspaceRole} from '@/types/state';
import WorkspaceSharing from '@/components/Workspaces/WorkspaceSharing.jsx';
import {AppCloseButton} from '../AppCloseButton';

interface SharingAppProps {
    workspaceId: string;
    panelConfig: unknown;
    showCloseButton?: boolean;
    onClose?: () => void;
}

// WorkspaceSharing compares the current user's permission against the uppercase
// PERMISSIONS_ENUMS (READ/RW/RW_PLUS/ADMIN), but the workspace-store role is the
// lowercase WorkspaceRole (read/rw/rw+/admin). Map it so canManage / the invite
// permission filter behave correctly. (The old agent-rendered sharing app fed
// this via contextData.currentUserRole; the native app derives it from the
// current workspace's role in the workspace store — see phase-2 notes.)
const ROLE_TO_PERMISSION: Record<WorkspaceRole, string> = {
    read: 'READ',
    rw: 'RW',
    'rw+': 'RW_PLUS',
    admin: 'ADMIN',
};

export default function SharingApp({workspaceId, showCloseButton, onClose}: SharingAppProps) {
    const currentUserId = useAuthStore(s => s.userInfo?.id ?? '');
    const role = useWorkspaceStore(s => s.currentWorkspaceInfo?.role);
    const currentUserPermission = (role && ROLE_TO_PERMISSION[role]) || 'READ';

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="flex-shrink-0 border-b bg-gray-50 px-4 py-2 flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-700">Sharing</h2>
                {showCloseButton && onClose && (
                    <AppCloseButton onClose={onClose} label="Sharing" className="ml-auto"/>
                )}
            </div>

            {/* Body — WorkspaceSharing self-loads its data via useEffect. */}
            <div className="flex-1 min-h-0 overflow-auto p-4">
                <WorkspaceSharing
                    workspaceId={workspaceId}
                    currentUserId={currentUserId}
                    currentUserPermission={currentUserPermission}
                />
            </div>
        </div>
    );
}
