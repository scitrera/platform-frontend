import React, {useState} from 'react';
import {Search, User, Users, PlusCircle, Loader2, Home} from 'lucide-react';
import WorkspacesList from '../Widgets/WorkspacesList.jsx';
import NewWorkspaceModal from "../Workspaces/CreateWorkspaceDialog.jsx";
import {useWebSocket} from '../../hooks/useWebSocket.jsx';
import {WORKSPACE} from '../../constants/WebSocketConstants.jsx';
import {UI_CONSTANTS} from '../../constants/AppConstants';
import {titleCase} from "../../lib/utils";
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';

// Sidebar component for navigating workspaces.
const WorkspacesSidebar = () => {
    const userInfo = useAuthStore(s => s.userInfo);
    const currentTenant = useAuthStore(s => s.currentTenant);
    const uiConfig = useAuthStore(s => s.uiConfig);
    const workspaces = useWorkspaceStore(s => s.workspaces);
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const isLoadingWorkspaces = useWorkspaceStore(s => s.isLoadingWorkspaces);
    const setCurrentWorkspace = useWorkspaceStore(s => s.setCurrentWorkspace);
    const setCurrentWorkspaceCustom = useWorkspaceStore(s => s.setCurrentWorkspaceCustom);
    const loadApp = useAppPanelStore(s => s.loadApp);

    const {sendRpcRequest, sendMessage: sendWsMessage} = useWebSocket();

    const workspacesLabel = titleCase(uiConfig.workspacesLabel);

    const [workspaceSearchTerm, setWorkspaceSearchTerm] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const handleWorkspaceSelect = (id) => {
        setCurrentWorkspace(id);
    };

    // Open the workspace settings page for a workspace the user administers.
    // Switch to the target workspace first (apps render against the current
    // workspace) then mount the settings app into the main panel.
    const handleWorkspaceSettings = (id) => {
        setCurrentWorkspace(id);
        loadApp({
            id: UI_CONSTANTS.APP_ID_WORKSPACE_SETTINGS,
            type: UI_CONSTANTS.APP_TYPE_WORKSPACE_SETTINGS,
            title: 'Workspace Settings',
            closeable: true,
        });
    };

    const handleCreateWorkspace = async ({title, workspaceId, templateId}) => {
        const response = await sendRpcRequest(WORKSPACE.CREATE_WORKSPACE, {
            title,
            workspaceId,
            templateId,
        });
        // Update workspace in UI
        setCurrentWorkspaceCustom(response.workspaceData ?? response);
        // request that the server update our workspace list -- which should happen in the background
        sendWsMessage(WORKSPACE.GET_WORKSPACES, null);
        return response;
    };

    const filterWorkspaces = (wsList) =>
        wsList.filter(ws => {
            return (
                // hide workspaces that start with underscores, but allow the magic private workspace
                (ws.id === "_private" || !ws.id.startsWith("_")) &&

                // only show workspaces with mode not defined or defined as a known "typical" workspace mode
                (!ws.mode || ws.mode === 'app-only' || ws.mode === 'no-chat') &&

                // do simple search on label if filter specified
                ws.label.toLowerCase().includes(workspaceSearchTerm.toLowerCase())
            );
        });

    const sharedWorkspaces = filterWorkspaces(workspaces.shared);
    const privateWorkspaces = filterWorkspaces(workspaces.private);

    // only show new workspace button if user has "create workspace" permissions
    // noinspection JSUnresolvedReference
    const userHasCreatePermissions = userInfo?.permissions?.canCreateWorkspaces;
    const tenantDefaultWorkspace = currentTenant?.default_workspace;
    return (
        <>
            <NewWorkspaceModal
                open={isCreateModalOpen}
                onOpenChange={setIsCreateModalOpen}
                onCreateWorkspace={handleCreateWorkspace}
            />
            <div className="p-4 border-b border-gray-300 flex-shrink-0">
                <div className="relative">
                    <input
                        type="text"
                        placeholder={`Search ${workspacesLabel}...`}
                        className="w-full p-2 pl-8 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={workspaceSearchTerm}
                        onChange={(e) => setWorkspaceSearchTerm(e.target.value)}
                        aria-label={`Search ${workspacesLabel}`}
                    />
                    <Search size={18} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
                            aria-hidden="true"/>
                </div>
            </div>

            <div className="px-4 pt-4 pb-0 border-t border-gray-300 flex-shrink-0 flex justify-evenly">
                {(tenantDefaultWorkspace || uiConfig.autoSelectWorkspace === false) && (<button onClick={() => setCurrentWorkspace(null)}
                                                      className="flex items-center px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                    <Home size={16} className="mr-1.5"/> Home
                </button>)}
                {userHasCreatePermissions && (<button onClick={() => setIsCreateModalOpen(true)}
                                                      className="flex items-center px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                    <PlusCircle size={16} className="mr-1.5"/> New
                </button>)}
            </div>

            <div className="flex-grow overflow-y-auto px-4 pt-1 pb-4 space-y-6">
                {isLoadingWorkspaces ? (
                    <div className="flex items-center justify-center text-gray-500 py-10">
                        <Loader2 size={20} className="animate-spin mr-2"/> Loading {workspacesLabel}...
                    </div>
                ) : (
                    <>
                        {sharedWorkspaces.length > 0 && <WorkspacesList title={`Shared ${workspacesLabel}`}
                                                                        icon={<Users size={20} className="mr-2"/>}
                                                                        workspaces={sharedWorkspaces}
                                                                        onSelect={handleWorkspaceSelect}
                                                                        onSettings={handleWorkspaceSettings}
                                                                        currentWorkspaceId={currentWorkspaceId}/>}
                        {privateWorkspaces.length > 0 && <WorkspacesList title={`Private ${workspacesLabel}`}
                                                                         icon={<User size={20} className="mr-2"/>}
                                                                         workspaces={privateWorkspaces}
                                                                         onSelect={handleWorkspaceSelect}
                                                                         onSettings={handleWorkspaceSettings}
                                                                         currentWorkspaceId={currentWorkspaceId}/>}
                    </>
                )}
            </div>
        </>
    );
};

export default WorkspacesSidebar;
