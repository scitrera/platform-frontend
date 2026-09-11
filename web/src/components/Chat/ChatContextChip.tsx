import {Pin} from 'lucide-react';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {UI_CONSTANTS} from '@/constants/AppConstants';

/**
 * Informational chip above the input that shows the rail's current
 * scope-of-send context: the active workspace and the main app (if any).
 *
 * Phase 1: read-only. Future phases may turn this into a control to
 * override the workspace/app pinned on the next outbound message.
 */
export default function ChatContextChip() {
    const workspaceInfo = useWorkspaceStore(s => s.currentWorkspaceInfo);
    const mainPanel = useAppPanelStore(s => s.main);

    if (!workspaceInfo) return null;

    const showApp = Boolean(
        mainPanel?.title &&
        mainPanel.id !== UI_CONSTANTS.APP_ID_SELECT_WORKSPACE_PROMPT,
    );

    return (
        <div className="px-4 pt-2 bg-gray-50">
            <div className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
                <Pin size={12}/>
                <span>Context: {workspaceInfo.label}</span>
                {showApp && (
                    <>
                        <span className="text-gray-400">·</span>
                        <span>{mainPanel?.title}</span>
                    </>
                )}
            </div>
        </div>
    );
}
