import React, {useEffect} from 'react';
import {Loader2, RotateCw, X} from 'lucide-react';
import {useWebSocket} from '../../hooks/useWebSocket.jsx';
import DynamicJSXRenderer from './DynamicJSXRenderer.jsx';
import {DYNAMIC_JSX} from '../../constants/WebSocketConstants.jsx';

// Placeholder for dynamically loaded applications.
// Also serves as the content for an app panel when a specific app is loaded.
const DynamicAppPlaceholder = ({
                                   appName,
                                   message,
                                   workspaceId,
                                   panelConfig,
                                   showCloseButton,
                                   onClose
                               }) => {
    const {sendMessage, isConnected, dynamicJSXContent} = useWebSocket();

    useEffect(() => {
        // Request the dynamic JSX content when the app is loaded (only for non-iframe apps)
        if (isConnected && panelConfig && panelConfig.id && !panelConfig.iframe) {
            sendMessage(DYNAMIC_JSX.CONTENT, {
                    appId: panelConfig.id,
                    workspaceId
                }
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [panelConfig, workspaceId, isConnected]);

    return (
        <div className="flex flex-col h-full min-w-0 min-h-0">
            <div className="p-3 border-b bg-gray-50 flex justify-between items-center flex-shrink-0">
                {/*{appIcon && (*/}
                {/*    <LazyLucideIcon key={appIcon} iconName={appIcon} size={18}*/}
                {/*                    className="mr-3 text-gray-700 flex-shrink-0"/>*/}
                {/*)}*/}
                <h2 className="text-md font-semibold text-gray-700">
                    {appName || 'Application'}
                    {/*&nbsp;*/}
                    {/*<button*/}
                    {/*    className="p-1 rounded hover:bg-gray-100 text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"*/}
                    {/*    title="Refresh"*/}
                    {/*>*/}
                    {/*    <RotateCw size={16}/>*/}
                    {/*</button>*/}
                </h2>
                {showCloseButton && (
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-200 rounded-full text-gray-500 hover:text-gray-700"
                        title={`Close ${appName || 'App'}`}
                    >
                        <X size={18}/>
                    </button>
                )}
            </div>
            <div className="flex-grow flex flex-col bg-gray-50 overflow-y-auto min-w-0 min-h-0">
                {/* Render iframe if the app is iframe-based */}
                {panelConfig && panelConfig.iframe ? (
                    <iframe
                        src={panelConfig.iframe}
                        title={appName || 'External Content'}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-same-origin allow-forms"
                        referrerPolicy="no-referrer"
                    />
                ) : panelConfig && panelConfig.id && dynamicJSXContent && dynamicJSXContent[panelConfig.id] ? (
                    <div className="p-6 min-w-0 min-h-0 flex-1">
                        <DynamicJSXRenderer componentId={panelConfig.id}/>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        {message && <p className="text-gray-500 mb-4">{message}</p>}
                        {!appName && !message && (
                            <>
                                {/*<LayoutGrid size={48} className="text-gray-300 mb-4"/>*/}
                                <p className="text-lg text-gray-600">Loading...</p>
                            </>
                        )}
                        <div className="flex items-center justify-center text-gray-500 py-10">
                            <Loader2 size={48} className="animate-spin mr-2"/>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DynamicAppPlaceholder;
