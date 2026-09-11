import React, {useEffect, useState} from 'react';
import {useWebSocket} from '../../hooks/useWebSocket.jsx';
import {ChevronLeft, ChevronRight, AppWindow, FolderKanban,} from 'lucide-react';
import {UI_CONSTANTS, DEBUG_MODE} from "../../constants/AppConstants";
import {DYNAMIC_JSX, CUSTOM_COMPONENTS} from '../../constants/WebSocketConstants.jsx';
import WorkspacesSidebar from "../Workspaces/WorkspacesSidebar.jsx";
import AppsSidebar from "../Apps/AppsSidebar.jsx";
import DynamicJSXRenderer from "../Apps/DynamicJSXRenderer.jsx";
import {titleCase} from "../../lib/utils";
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useUIStore} from '@/stores/uiStore';

// Sidebar component for navigating workspaces and applications.
// Its width and behavior change based on whether a workspace is selected.
const Sidebar = () => {
    const currentTenant = useAuthStore(s => s.currentTenant);
    const uiConfig = useAuthStore(s => s.uiConfig);
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const availableApps = useWorkspaceStore(s => s.availableApps);
    const sidebarCollapsed = useUIStore(s => s.sidebarCollapsed);
    const toggleSidebar = useUIStore(s => s.toggleSidebar);

    // isConnected gates the effect below. Without it the RPC fires on mount —
    // before the socket exists, since connect() only runs after the /checkz
    // probe resolves — and logs a failure on every page load. `sendRpcRequest`
    // changes identity with the connection state, so the effect re-runs and
    // succeeds once connected; the early attempt was only ever noise.
    const {sendRpcRequest, dynamicJSXContent, isConnected} = useWebSocket();
    const [sidebarChoice, setSidebarChoice] = useState(null);
    const [failedWorkspace, setFailedWorkspace] = useState(null);

    // Check if there are any available apps
    const hasAvailableApps = availableApps?.length > 0;
    const appsEnabled = hasAvailableApps && Boolean(uiConfig.showAppsSidebar);
    const modeKey = JSON.stringify([currentWorkspaceId, appsEnabled]);
    const defaultMode = currentWorkspaceId && appsEnabled
        ? UI_CONSTANTS.SIDEBAR_MODE_APPS : UI_CONSTANTS.SIDEBAR_MODE_WORKSPACES;
    const currentSidebarMode = sidebarChoice?.key === modeKey ? sidebarChoice.mode : defaultMode;
    const setCurrentSidebarMode = mode => setSidebarChoice({key: modeKey, mode});
    const showDynamicSidebar = failedWorkspace !== currentWorkspaceId
        && Boolean(dynamicJSXContent?.[CUSTOM_COMPONENTS.SIDEBAR]);

    const workspacesLabel = titleCase(uiConfig.workspacesLabel);
    const applicationsLabel = titleCase(uiConfig.applicationsLabel);

    // Try to load dynamic jsx for a "_sidebar" component
    useEffect(() => {
        let active = true;
        const loadSidebarContent = async () => {
            if (!isConnected || !sendRpcRequest || !currentWorkspaceId) return;

            DEBUG_MODE && console.log("effect: sidebar: DYNAMIC_JSX.CONTENT RPC REQUEST");
            try {
                await sendRpcRequest(DYNAMIC_JSX.CONTENT, {
                    appId: CUSTOM_COMPONENTS.SIDEBAR,
                    workspaceId: currentWorkspaceId,
                });
                if (active) setFailedWorkspace(null);
            } catch (error) {
                // On error, stick with default fallback
                DEBUG_MODE && console.log(`_sidebar app not available, using default content; ${error}`);
                if (active) setFailedWorkspace(currentWorkspaceId);
            }
        };

        // noinspection JSIgnoredPromiseFromCall
        loadSidebarContent();
        return () => { active = false; };
    }, [isConnected, currentWorkspaceId, sendRpcRequest]);

    // Show applications sidebar when a workspace is selected (if enabled)
    useEffect(() => {
        if (currentWorkspaceId && hasAvailableApps && uiConfig.showAppsSidebar) {
            // ensure that the sidebar is not collapsed
            toggleSidebar(false);
        }
    }, [currentWorkspaceId, hasAvailableApps, uiConfig.showAppsSidebar, toggleSidebar]);

    // Determine sidebar width class and toggle button visibility.
    //
    // "Chat-first" default: when no workspace is selected we still start
    // collapsed so the chat rail can take the screen. The user can click
    // the workspace icon in the collapsed strip to expand the picker, at
    // which point we use the wider layout for comfortable browsing.
    let sidebarWidthClass = '';
    let showUserToggleButton = false; // Button for user to toggle between w-16 and w-72

    if (sidebarCollapsed) {
        sidebarWidthClass = UI_CONSTANTS.SIDEBAR_CLASS_COLLAPSED;
        showUserToggleButton = false;
    } else if (!currentWorkspaceId && uiConfig.useWideWorkspacePicker) {
        // Opt-in legacy behavior: oversized workspace-picker takeover when
        // expanded with no workspace. Default off — see DEFAULT_UI_CONFIG.
        sidebarWidthClass = UI_CONSTANTS.SIDEBAR_CLASS_EXTRA_WIDE;
        showUserToggleButton = true;
    } else {
        sidebarWidthClass = UI_CONSTANTS.SIDEBAR_CLASS_NORMAL;
        showUserToggleButton = true;
    }

    // Collapsed view (w-16) — fires regardless of whether a workspace is
    // active so a fresh session lands chat-first instead of the old
    // 70vw workspace-picker takeover.
    if (sidebarCollapsed) {
        if (!showDynamicSidebar) {
            return (
                <aside
                    className={`bg-gray-800 text-white h-full flex flex-col items-center py-4 space-y-6 flex-shrink-0 ${sidebarWidthClass} transition-all duration-300 ease-in-out`}
                    aria-label="Collapsed Sidebar"
                >
                    {uiConfig.showWorkspacesSidebar && <FolderKanban
                        onClick={() => {
                            setCurrentSidebarMode(UI_CONSTANTS.SIDEBAR_MODE_WORKSPACES);
                            toggleSidebar();
                        }}
                        size={24} className={`cursor-pointer hover:text-theme-sidebar-active-text`} title={workspacesLabel}/>}
                    {uiConfig.showAppsSidebar && hasAvailableApps && (
                        <AppWindow
                            onClick={() => {
                                setCurrentSidebarMode(UI_CONSTANTS.SIDEBAR_MODE_APPS);
                                toggleSidebar();
                            }}
                            size={24} className={`cursor-pointer hover:text-theme-sidebar-active-text`} title={applicationsLabel}/>
                    )}
                </aside>
            );
        }
        return (
            <aside
                className={`bg-gray-800 text-white h-full flex flex-col items-center py-4 space-y-6 flex-shrink-0 ${sidebarWidthClass} transition-all duration-300 ease-in-out`}
                aria-label="Collapsed Sidebar"
            >
                <ChevronRight
                    onClick={() => {
                        setCurrentSidebarMode(UI_CONSTANTS.SIDEBAR_MODE_WORKSPACES);
                        toggleSidebar();
                    }}
                    size={24} className={`cursor-pointer hover:text-theme-sidebar-active-text`} title={workspacesLabel}/>
            </aside>
        );
    }

    const tenantLogo = currentTenant?.logo || "/logo2.png";
    const tenantName = currentTenant?.name || "scitrera.ai";

    // Expanded view (either 70vw for initial selection, or w-72 for normal user-expanded)
    return (
        <>
            <aside
                className={`bg-theme-sidebar-bg h-full flex flex-col border-r border-theme-sidebar-border flex-shrink-0 ${sidebarWidthClass} transition-all duration-300 ease-in-out overflow-hidden`}
                aria-label="Sidebar"
            >
                <div className="p-4 flex justify-between items-center border-b border-theme-sidebar-border flex-shrink-0">
                    {showUserToggleButton && (
                        <button
                            onClick={() => toggleSidebar()}
                            className="p-2 hover:bg-theme-sidebar-hover-bg rounded"
                            title="Collapse Sidebar"
                            aria-label="Collapse sidebar"
                        >
                            <ChevronLeft size={24}/>
                        </button>
                    )}
                    {!showDynamicSidebar ?
                        <div className="flex items-center space-x-4">
                            {currentSidebarMode === 'workspaces' ? (
                                <>
                                    <span className="text-lg font-semibold text-theme-sidebar-text">{workspacesLabel}</span>
                                    {uiConfig.showAppsSidebar && hasAvailableApps && (
                                        <button
                                            onClick={() => setCurrentSidebarMode(UI_CONSTANTS.SIDEBAR_MODE_APPS)}
                                            className={`flex items-center p-2 rounded ${currentSidebarMode === UI_CONSTANTS.SIDEBAR_MODE_APPS ? 'bg-theme-sidebar-hover-bg' : 'hover:bg-theme-sidebar-hover-bg'}`}
                                            title={applicationsLabel}
                                            disabled={!currentWorkspaceId}
                                        ><AppWindow size={18} className="mr-2"/>
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    <span className="text-lg font-semibold text-theme-sidebar-text">{applicationsLabel}</span>
                                    {uiConfig.showWorkspacesSidebar && <button
                                        onClick={() => setCurrentSidebarMode(UI_CONSTANTS.SIDEBAR_MODE_WORKSPACES)}
                                        className={`flex items-center p-2 rounded ${currentSidebarMode === UI_CONSTANTS.SIDEBAR_MODE_WORKSPACES ? 'bg-theme-sidebar-hover-bg' : 'hover:bg-theme-sidebar-hover-bg'}`}
                                        title={workspacesLabel}
                                    ><FolderKanban size={18} className="mr-2"/>
                                    </button>}
                                </>
                            )}
                        </div>
                        :
                        <div className="flex items-center space-x-4">
                            <span className="text-lg font-semibold text-theme-sidebar-text">
                                {/* TODO: Get title text from dynamic JSX scope variable if defined??? */}
                                <img src={tenantLogo} alt={`${tenantName} Logo`} className="h-8 w-auto"/>
                            </span>
                        </div>
                    }
                </div>
                <div className="relative flex-grow overflow-hidden">
                    {showDynamicSidebar && dynamicJSXContent?.[CUSTOM_COMPONENTS.SIDEBAR] ? (
                        <div
                            className={`absolute inset-0 transition-transform duration-300 ease-in-out overflow-y-auto`}
                        >
                            <DynamicJSXRenderer componentId={CUSTOM_COMPONENTS.SIDEBAR}/>
                        </div>
                    ) : (
                        <>
                            {uiConfig.showWorkspacesSidebar && <div
                                className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
                                    currentSidebarMode === UI_CONSTANTS.SIDEBAR_MODE_APPS ? 'transform -translate-y-full' : ''
                                } overflow-y-auto`}
                            >
                                <WorkspacesSidebar/>
                            </div>}
                            {uiConfig.showAppsSidebar && <div
                                className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
                                    currentSidebarMode === UI_CONSTANTS.SIDEBAR_MODE_WORKSPACES ? 'transform translate-y-full' : ''
                                } overflow-y-auto`}
                            >
                                <AppsSidebar/>
                            </div>}
                        </>
                    )}
                </div>
            </aside>
        </>
    )
        ;
};

export default Sidebar;
