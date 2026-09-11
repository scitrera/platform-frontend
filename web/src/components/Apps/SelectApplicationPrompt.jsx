import React, {useRef, useEffect} from 'react';
import {useWebSocket} from '../../hooks/useWebSocket.jsx';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {DYNAMIC_JSX, CUSTOM_COMPONENTS} from '../../constants/WebSocketConstants.jsx';
import DynamicJSXRenderer from './DynamicJSXRenderer.jsx';
import AppsIconGrid from "./AppsIconGrid.jsx";
import LazyLucideIcon from "../UI/LazyLucideIcon.jsx";

// Component displayed when no application is selected.
const SelectApplicationPrompt = ({
                                     message,
                                     iconSize = 36,
                                     gridCols = 3,
                                     showLabels = true,
                                     dynamicLoad = false,
                                 },) => {
    const {sendRpcRequest, dynamicJSXContent} = useWebSocket();
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const showDynamic = dynamicLoad && Boolean(dynamicJSXContent?.[CUSTOM_COMPONENTS.PLACEHOLDER]);
    const containerRef = useRef(null);

    // Try to load dynamic jsx for a "_placeholder" component
    useEffect(() => {
        const loadPlaceholderContent = async () => {
            if (!dynamicLoad || !sendRpcRequest || !currentWorkspaceId) return;

            try {
                await sendRpcRequest(DYNAMIC_JSX.CONTENT, {
                    appId: CUSTOM_COMPONENTS.PLACEHOLDER, // TODO: constants for appId values like this...
                    workspaceId: currentWorkspaceId
                });
                // eslint-disable-next-line no-unused-vars
            } catch (error) {
                // On error, stick with default fallback
                // DEBUG_MODE && console.log(`_placeholder app not available, using default content; ${error}`);
            }
        };

        // noinspection JSIgnoredPromiseFromCall
        loadPlaceholderContent();
    }, [dynamicLoad, sendRpcRequest, currentWorkspaceId]);

    // Show dynamic content if available, otherwise show default fallback
    if (showDynamic && dynamicJSXContent?.[CUSTOM_COMPONENTS.PLACEHOLDER]) {
        return (
            <div ref={containerRef} className="h-full">
                <DynamicJSXRenderer componentId={CUSTOM_COMPONENTS.PLACEHOLDER}/>
            </div>
        );
    }

    // This is the default fallback output
    // <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-gray-50">
    //             <Hand size={48} className="text-blue-400 mb-4"/>
    //             <h2 className="text-xl font-semibold text-gray-700 mb-2">Welcome!</h2>
    //             <p className="text-gray-500">
    //                 {message || "Please select an application from the sidebar to get started."}
    //             </p>
    //         </div>
    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="relative w-full max-w-4xl">
                {/* Soft background glow */}
                <div
                    className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-blue-20 to-indigo-50 blur-lg"></div>

                <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
                    <div className="px-6 sm:px-8 py-8 sm:py-10">
                        {/* Icon header */}
                        <div className="flex items-center justify-center gap-3">
                            <span
                                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
                                <LazyLucideIcon iconName="LayoutGrid" className="h-6 w-6 text-emerald-600"/>
                            </span>
                            <span
                                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-100">
                                <LazyLucideIcon iconName="MousePointerClick" className="h-6 w-6 text-amber-600"/>
                            </span>
                            <span
                                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 ring-1 ring-indigo-100">
                                <LazyLucideIcon iconName="Sparkles" className="h-6 w-6 text-indigo-600"/>
                            </span>
                        </div>

                        {/* Title */}
                        <h2 className="mt-6 text-center text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                            Select an app to continue
                        </h2>
                        {message ?
                            (<p className="mt-2 text-center text-slate-600">{message}</p>) :
                            (<p className="mt-2 text-center text-slate-600">
                                Pick an app below to open it in your
                                workspace.
                            </p>)
                        }

                        {/* Decorative divider */}
                        <div
                            className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent"/>

                        {/* Apps grid */}
                        <div className="mt-6">
                            <AppsIconGrid
                                iconSize={iconSize}
                                gridCols={gridCols}
                                showLabels={showLabels}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SelectApplicationPrompt;