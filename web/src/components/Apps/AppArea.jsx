import React, {useState, useEffect, useCallback, useRef} from 'react';
import AdminDashboardApp from './Admin/AdminDashboardApp';
import WorkspaceSettingsApp from './WorkspaceSettings/WorkspaceSettingsApp';
import KnowledgebaseApp from './Knowledgebase/KnowledgebaseApp';
import LibraryApp from './Library/LibraryApp';
import SharingApp from './Sharing/SharingApp';
import DocumentViewerApp from './DocViewer/DocumentViewerApp';
import DynamicAppPlaceholder from './DynamicAppPlaceholder.jsx';
import SelectWorkspacePrompt from '../Workspaces/SelectWorkspacePrompt.jsx';
import SelectApplicationPrompt from "./SelectApplicationPrompt.jsx";
import UnauthenticatedPlaceholder from '../Auth/UnauthenticatedPlaceholder.jsx';
import {GripVertical} from 'lucide-react';
import {UI_CONSTANTS} from "../../constants/AppConstants";
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {isAppPanelCloseable} from '@/utils/appPanels';

// Main content area that holds one or two application panels.
const AppArea = () => {
        const isAuthenticated = useAuthStore(s => s.isAuthenticated);
        const chatEnabled = useAuthStore(s => s.uiConfig.chatEnabled !== false);
        const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
        const currentWorkspaceInfo = useWorkspaceStore(s => s.currentWorkspaceInfo);
        const availableApps = useWorkspaceStore(s => s.availableApps);
        const mainPanelConfig = useAppPanelStore(s => s.main);
        const secondaryPanelConfig = useAppPanelStore(s => s.secondary);
        const appLayout = useAppPanelStore(s => s.appLayout);
        const appSplit = useAppPanelStore(s => s.appSplit);
        const setAppSplit = useAppPanelStore(s => s.setAppSplit);
        const closeMainApp = useAppPanelStore(s => s.closeMainApp);
        const closeApp2 = useAppPanelStore(s => s.closeApp2);

        // Create a chat panel config if it doesn't exist in the app state
        const panel2Config = secondaryPanelConfig?.id ? secondaryPanelConfig : null;

        // Without chat, an empty workspace still needs its app-selection prompt.
        const showMainPanel = mainPanelConfig || !chatEnabled || (currentWorkspaceInfo?.mode === 'app-only' || currentWorkspaceInfo?.mode === 'no-chat');
        const showMainOnly = (mainPanelConfig && mainPanelConfig.id === UI_CONSTANTS.APP_ID_SELECT_WORKSPACE_PROMPT) ||
            (currentWorkspaceInfo?.mode === 'app-only' || mainPanelConfig?.mode === 'app-only') || (panel2Config == null);

        const [isDragging, setIsDragging] = useState(false);
        const applyTransition = !isDragging;
        const appAreaRef = useRef(null); // Ref for the container of the panels

        // Handler for starting the drag operation on the divider
        const handleMouseDownOnDivider = (e) => {
            e.preventDefault();
            setIsDragging(true);
        };

        // Handler for releasing the drag
        const handleMouseUpGlobal = useCallback(() => {
            if (isDragging) {
                setIsDragging(false);
            }
        }, [isDragging]);

        // Handler for mouse movement during drag
        const handleMouseMoveGlobal = useCallback((e) => {
            if (!isDragging || !appAreaRef.current || !showMainPanel) return;

            const containerRect = appAreaRef.current.getBoundingClientRect();
            let newSplitPercentage;

            if (appLayout === UI_CONSTANTS.APP_LAYOUT_HORIZONTAL) {
                // Calculate split based on mouse X position relative to the container
                const mouseXInContainer = e.clientX - containerRect.left;
                newSplitPercentage = (mouseXInContainer / containerRect.width) * 100;
            } else { // Vertical layout
                // Calculate split based on mouse Y position relative to the container
                const mouseYInContainer = e.clientY - containerRect.top;
                newSplitPercentage = (mouseYInContainer / containerRect.height) * 100;
            }

            // Clamp the split percentage between 10% and 90%
            const clampedSplit = Math.max(UI_CONSTANTS.MIN_SPLIT_PCT, Math.min(UI_CONSTANTS.MAX_SPLIT_PCT, newSplitPercentage));
            setAppSplit(clampedSplit);

        }, [isDragging, appLayout, setAppSplit, showMainPanel]); // appAreaRef is stable

        // Effect to add/remove global event listeners for dragging
        useEffect(() => {
            if (isDragging) {
                document.addEventListener('mousemove', handleMouseMoveGlobal);
                document.addEventListener('mouseup', handleMouseUpGlobal);
            } else {
                document.removeEventListener('mousemove', handleMouseMoveGlobal);
                document.removeEventListener('mouseup', handleMouseUpGlobal);
            }
            // Cleanup function
            return () => {
                document.removeEventListener('mousemove', handleMouseMoveGlobal);
                document.removeEventListener('mouseup', handleMouseUpGlobal);
            };
        }, [isDragging, handleMouseMoveGlobal, handleMouseUpGlobal]);

        // Function to render the appropriate component based on panel configuration
        const renderPanelComponent = (panelConfig, isMainPanel = false) => {
            if (panelConfig?.id === UI_CONSTANTS.APP_ID_SELECT_WORKSPACE_PROMPT) {
                return <SelectWorkspacePrompt/>;
            }

            // if no workspace, but trying to render something other than prompt, then show prompt instead!
            if (!currentWorkspaceId && panelConfig?.id !== UI_CONSTANTS.APP_ID_SELECT_WORKSPACE_PROMPT) {
                return <SelectWorkspacePrompt/>;
            }

            if (isMainPanel && (!panelConfig || panelConfig.id === null)) {
                // we use dynamicLoad to attempt to load an external _placeholder for customization; by default,
                // dynamicLoad is false so that it can be re-used by tenant customization
                return <SelectApplicationPrompt dynamicLoad={true}/>
            }

            if (!panelConfig) return null;

            const showCloseButton = isAppPanelCloseable(
                panelConfig, isMainPanel, currentWorkspaceInfo, availableApps.length,
            );

            const closeFunction = () => {
                if (isMainPanel) {
                    closeMainApp();
                } else {
                    closeApp2();
                }
            }

            switch (panelConfig.type) {
                case UI_CONSTANTS.APP_TYPE_ADMIN_CONSOLE: {
                    return <AdminDashboardApp/>;
                }
                case UI_CONSTANTS.APP_TYPE_WORKSPACE_SETTINGS: {
                    return <WorkspaceSettingsApp/>;
                }
                case UI_CONSTANTS.APP_TYPE_KNOWLEDGEBASE: {
                    return <KnowledgebaseApp workspaceId={currentWorkspaceId} panelConfig={panelConfig}
                                             showCloseButton={showCloseButton} onClose={closeFunction}/>;
                }
                case UI_CONSTANTS.APP_TYPE_LIBRARY: {
                    return <LibraryApp workspaceId={currentWorkspaceId} panelConfig={panelConfig}
                                       showCloseButton={showCloseButton} onClose={closeFunction}/>;
                }
                case UI_CONSTANTS.APP_TYPE_SHARING: {
                    return <SharingApp workspaceId={currentWorkspaceId} panelConfig={panelConfig}
                                       showCloseButton={showCloseButton} onClose={closeFunction}/>;
                }
                case UI_CONSTANTS.APP_TYPE_DOC_VIEWER: {
                    return <DocumentViewerApp workspaceId={currentWorkspaceId} panelConfig={panelConfig}
                                              showCloseButton={showCloseButton} onClose={closeFunction}/>;
                }
                default: // For any other dynamically loaded app type
                {
                    // if we have a placeholder application title/name, then we should try to get it from availableApps
                    const appData = availableApps.find(app => app.id === panelConfig.id);
                    const appIcon = appData?.icon;
                    // Older navigation paths use a brand placeholder until the catalog arrives.
                    const appTitle = panelConfig.title === 'scitrera.ai'
                        ? (appData?.name || panelConfig.title)
                        : (panelConfig.title || appData?.name || panelConfig.name);
                    return (<DynamicAppPlaceholder
                        appName={appTitle || panelConfig.title}
                        appIcon={appIcon}
                        workspaceId={currentWorkspaceId}
                        panelConfig={panelConfig}
                        // The same policy applies to main and secondary app headers.
                        showCloseButton={showCloseButton}
                        onClose={closeFunction}
                    />);
                }
            }
        };

        const transitionClasses = applyTransition ? 'transition-all duration-300 ease-in-out' : '';

        // Calculate flex-basis for panels
        // If there's no main app or the main app is chat, the chat panel takes 100%
        // -- but if main is prompt, then we set things up so that main is 100% (and no chat)
        const mainPanelFlexBasis = showMainPanel ? (showMainOnly ? '100%' : `${appSplit}%`) : '0%';
        const secondaryPanelFlexBasis = showMainPanel ? (showMainOnly ? '0%' : `${100 - appSplit}%`) : '100%';

        // If user is not authenticated, show the unauthenticated placeholder
        if (!isAuthenticated) {
            return (
                <main
                    className="flex-grow flex p-1 bg-gray-200 overflow-hidden min-w-0 min-h-0"
                    aria-label="Main application area"
                >
                    <div className="relative p-1 w-full min-w-0 min-h-0">
                        <div className="bg-white h-full w-full rounded-md shadow-sm overflow-hidden min-w-0 min-h-0">
                            <UnauthenticatedPlaceholder/>
                        </div>
                    </div>
                </main>
            );
        }

        // Otherwise, show the normal app content
        return (<main
            ref={appAreaRef}
            className={`flex-grow flex p-1 bg-gray-200 overflow-hidden min-w-0 min-h-0 ${appLayout === UI_CONSTANTS.APP_LAYOUT_VERTICAL ? 'flex-col' : 'flex-row'}`}
            aria-label="Main application area"
        >
            {/* Main Panel (Only shown if it's not a chat app) */}
            {showMainPanel && (<div
                className={`relative p-1 min-w-0 min-h-0 ${transitionClasses}`}
                style={{flexBasis: mainPanelFlexBasis}}
            >
                <div className="bg-white h-full w-full rounded-md shadow-sm overflow-hidden min-w-0 min-h-0">
                    {renderPanelComponent(mainPanelConfig, true)}
                </div>
            </div>)}

            {/* Draggable Separator (only if main panel is shown) */}
            {showMainPanel && !showMainOnly && (<div
                className={`flex-shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-gray-400 bg-gray-300 rounded-sm transition-colors duration-150
                                ${appLayout === UI_CONSTANTS.APP_LAYOUT_VERTICAL ? 'h-2.5 w-full my-0.5' : 'w-2.5 h-full mx-0.5'}`}
                onMouseDown={handleMouseDownOnDivider} // Attach mousedown to the divider
                title="Drag to resize panels"
                role="separator"
                aria-orientation={appLayout}
                aria-valuenow={appSplit}
                aria-valuemin={UI_CONSTANTS.MIN_SPLIT_PCT}
                aria-valuemax={UI_CONSTANTS.MAX_SPLIT_PCT}
            >
                <GripVertical size={16}
                              className={`text-gray-600 ${appLayout === UI_CONSTANTS.APP_LAYOUT_VERTICAL ? 'rotate-90' : ''}`}/>
            </div>)}

            {/* Secondary Panel */}
            {!showMainOnly && panel2Config && (<div
                className={`relative p-1 min-w-0 min-h-0 ${transitionClasses}`}
                style={{flexBasis: secondaryPanelFlexBasis}}
            >
                <div className="bg-white h-full w-full rounded-md shadow-sm overflow-hidden min-w-0 min-h-0">
                    {renderPanelComponent(panel2Config, false)}
                </div>
            </div>)}
        </main>);
    }
;

export default AppArea;
