import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';

/**
 * "Workspace as thread" mode: the thread selector is hidden and the active chat
 * thread is pinned to the current workspace (thread_id === workspace id) — one
 * implicit thread per workspace.
 *
 * Hybrid resolution: a workspace can force it on via
 * ``WorkspaceInfo.mode === 'workspace-as-thread'``; otherwise the global
 * ``uiConfig.workspaceAsThread`` flag decides.
 */
export function useWorkspaceAsThread(): boolean {
    const workspaceAsThreadFlag = useAuthStore(s => Boolean(s.uiConfig.workspaceAsThread));
    const mode = useWorkspaceStore(s => s.currentWorkspaceInfo?.mode);
    return mode === 'workspace-as-thread' || workspaceAsThreadFlag;
}

/**
 * "Workspace-homed threads" mode: chat threads are owned by (and unique to) the
 * current workspace instead of the user's cross-workspace home — switching
 * workspaces changes the available thread list. Unlike workspace-as-thread
 * (one implicit thread, no selector), this keeps the normal multi-thread
 * selector but scopes it per-workspace.
 *
 * Hybrid resolution (same shape as workspace-as-thread): a workspace can force
 * it on via ``WorkspaceInfo.mode === 'workspace-homed-threads'``; otherwise the
 * global ``uiConfig.workspaceHomedThreads`` flag decides. When on, the chat WS
 * requests carry ``workspaceScoped: true`` so the backend routes thread
 * ownership to the real workspace (see client_interface ownership plumbing).
 */
export function useWorkspaceHomedThreads(): boolean {
    const flag = useAuthStore(s => Boolean(s.uiConfig.workspaceHomedThreads));
    const mode = useWorkspaceStore(s => s.currentWorkspaceInfo?.mode);
    // workspace-as-thread is the more restrictive single-thread mode; it takes
    // precedence so the two never both drive the selector.
    const workspaceAsThread = useWorkspaceAsThread();
    return !workspaceAsThread && (mode === 'workspace-homed-threads' || flag);
}

/**
 * Whether the thread selector UI (sidebar / dropdown / list fetch) should be
 * shown: threads enabled AND not in workspace-as-thread mode.
 */
export function useShowThreadSelector(): boolean {
    const enableThreads = useAuthStore(s => Boolean(s.uiConfig.enableThreads));
    const workspaceAsThread = useWorkspaceAsThread();
    return enableThreads && !workspaceAsThread;
}
