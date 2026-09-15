import type {AppInfo, WorkspaceInfo} from '@/types/state';
import {DEFAULT_APPS, UI_CONSTANTS} from '@/constants/AppConstants';

export type AppPanelOptions = Pick<AppInfo, 'title' | 'closeable' | 'ownerAppId'>;

/** Resolve dynamic JSX navigation without dropping panel presentation options. */
export function resolveAppPanel(
    appId: string | null, availableApps: AppInfo[], options: AppPanelOptions = {},
): AppInfo | null {
    if (appId === null) return null;
    const app = appId === UI_CONSTANTS.APP_ID_CHAT
        ? DEFAULT_APPS.DEFAULT_CHAT_APP
        : availableApps.find(candidate => candidate.id === appId);
    return {id: appId, type: appId, ...app, ...options};
}

/** Header X policy. Programmatic navigation is independent of this affordance. */
export function isAppPanelCloseable(
    panel: AppInfo, isMainPanel: boolean, workspace: WorkspaceInfo | null,
    availableAppCount: number,
): boolean {
    if (!panel.id || panel.id === UI_CONSTANTS.APP_ID_SELECT_WORKSPACE_PROMPT) return false;
    if (panel.closeable !== undefined) return panel.closeable;
    if (!isMainPanel) return true;
    return availableAppCount !== 1 && panel.id !== workspace?.default_app
        && workspace?.mode !== 'app-only' && workspace?.mode !== 'no-chat';
}
