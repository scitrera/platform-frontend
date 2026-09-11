import {useEffect} from 'react';
import {useWebSocket} from './useWebSocket.jsx';
import {USER, WORKSPACE} from '../constants/WebSocketConstants.jsx';
import {UI_CONSTANTS, DEBUG_MODE} from '../constants/AppConstants';
import {parseUrlPath} from '../utils/urlUtils.js';
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore, findWorkspace} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';

/**
 * Runs the app-wide side effects that previously lived inside the
 * AppStateProvider component (browser navigation sync, WebSocket-driven
 * profile/workspace fetches, default-workspace fallback, default-app
 * selection, and chat-visibility enforcement).
 *
 * URL → state hydration at initial load happens earlier inside
 * checkAuthentication (WebSocketContext.jsx), batched with setCurrentTenant
 * so that useURLSync's first post-mount run sees fully-hydrated stores
 * and does not wipe the URL.
 *
 * Intended to be mounted exactly once at the app root (Layout.jsx).
 */
export default function useAppEffects() {
    const {sendMessage: sendWsMessage, isConnected} = useWebSocket();

    // Auth + tenant slices
    const userInfo = useAuthStore(s => s.userInfo);
    const tenantId = useAuthStore(s => s.tenantId);
    const currentTenant = useAuthStore(s => s.currentTenant);

    // Workspace slice
    const workspaces = useWorkspaceStore(s => s.workspaces);
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const currentWorkspaceInfo = useWorkspaceStore(s => s.currentWorkspaceInfo);
    const availableApps = useWorkspaceStore(s => s.availableApps);
    const setLoadingWorkspaces = useWorkspaceStore(s => s.setLoadingWorkspaces);
    const setCurrentWorkspace = useWorkspaceStore(s => s.setCurrentWorkspace);

    // App panel slice
    const mainPanel = useAppPanelStore(s => s.main);
    const loadApp = useAppPanelStore(s => s.loadApp);
    const setAppSplit = useAppPanelStore(s => s.setAppSplit);

    // Handle browser navigation (back/forward buttons)
    useEffect(() => {
        const handlePopState = () => {
            const {workspaceId, appId} = parseUrlPath();

            if (workspaceId !== currentWorkspaceId) {
                setCurrentWorkspace(workspaceId);
            }

            if (appId && workspaceId && (!mainPanel || mainPanel.id !== appId)) {
                loadApp({
                    id: appId, type: appId, title: "scitrera.ai",
                });
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [currentWorkspaceId, mainPanel, setCurrentWorkspace, loadApp]);

    // GET PROFILE IF WE DON'T HAVE USER INFO, THIS ALSO TRIGGERS GET_WORKSPACES
    useEffect(() => {
        if (isConnected) {
            if (userInfo?.id == null || !userInfo?.tenants) {
                sendWsMessage(USER.GET_PROFILE, {tenant: tenantId});
                setLoadingWorkspaces(true);
            } else {
                sendWsMessage(WORKSPACE.GET_WORKSPACES, {tenant: tenantId});
            }
        }
    }, [sendWsMessage, isConnected, userInfo, tenantId, setLoadingWorkspaces]);

    // Fetch applications when the workspace changes
    useEffect(() => {
        if (isConnected && currentWorkspaceId) {
            sendWsMessage(WORKSPACE.GET_APPLICATIONS, {workspace: currentWorkspaceId});
        }
    }, [currentWorkspaceId, sendWsMessage, isConnected]);

    // Pick the initial workspace once connected with none selected. Honor the tenant's
    // configured default_workspace only when it's a real, accessible workspace; otherwise
    // fall back to the per-user private home `_private` (always present — the backend
    // auto-creates + injects it). This also recovers from a stale/invalid default such as
    // the legacy `_default` sentinel that used to loop.
    useEffect(() => {
        if (!isConnected || currentWorkspaceId) return;
        // Wait until GET_WORKSPACES has populated the list (it always contains `_private`)
        // so we can validate the configured default before deciding.
        const loaded = !!(workspaces.private?.length || workspaces.shared?.length
            || workspaces.hidden?.length || workspaces.templates?.length);
        if (!loaded) return;
        const configured = currentTenant?.default_workspace;
        const target = (configured && findWorkspace(workspaces, configured)) ? configured : '_private';
        DEBUG_MODE && console.log(`effect: default workspace -> ${target} (configured=${configured})`);
        setCurrentWorkspace(target);
    }, [currentWorkspaceId, currentTenant, isConnected, workspaces, setCurrentWorkspace]);

    // Initial configuration of appSplit from local storage (once at load time)
    useEffect(() => {
        const storedSplit = localStorage.getItem(UI_CONSTANTS.LOCAL_STORAGE_APP_SPLIT_KEY);
        if (storedSplit) {
            setAppSplit(parseInt(storedSplit, 10));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Switch to the default app if defined on updating availableApps
    useEffect(() => {
        if (availableApps &&
            currentWorkspaceInfo &&
            mainPanel?.id == null &&
            currentWorkspaceInfo.default_app !== null) {
            const defaultAppId = currentWorkspaceInfo?.default_app;
            const defaultAppData = availableApps.find(app => app.id === defaultAppId);
            if (defaultAppData) {
                const defaultAppInfo = {
                    id: defaultAppData.id,
                    title: defaultAppData.name,
                    mode: defaultAppData.mode,
                    type: defaultAppData.type,
                };
                if (defaultAppData.iframe) defaultAppInfo.iframe = defaultAppData.iframe;
                DEBUG_MODE && console.info(`effect: set workspace app to default ${defaultAppId}`, defaultAppInfo);
                loadApp(defaultAppInfo);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentWorkspaceInfo, availableApps]);

}
