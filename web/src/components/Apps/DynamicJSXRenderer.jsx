import React, {useMemo, useRef, useState, useEffect, useCallback, useDeferredValue} from 'react';
import {createPortal} from "react-dom";
import {LiveProvider, LivePreview, LiveError, LiveEditor, LiveContext} from "react-live";
import {useWebSocket} from '../../hooks/useWebSocket.jsx';
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useAppPanelStore, getAppQueryParameter, setAppQueryParameter} from '@/stores/appPanelStore';
import {useUIStore} from '@/stores/uiStore';
import {USER, CHAT, WORKSPACE, DYNAMIC_JSX} from "../../constants/WebSocketConstants.jsx"
import {useFileUploader} from "../../utils/FileUploadFunctions.jsx";

// import other components that we use for rendering
import {Pie, Line} from 'react-chartjs-2';
import GenericTable from "../Widgets/GenericTable.jsx";
import FileBrowser from './LibraryFileBrowser.jsx';
import DataProviderManager from "./DataProvidersManager.jsx";
import WorkspaceSharing from "../Workspaces/WorkspaceSharing.jsx";
import {FileUpload} from "../Widgets/FileUpload.jsx";
import {FileDownload} from "../Widgets/FileDownload.jsx";
import {AnnotatedMarkdown} from "../Widgets/AnnotatedMarkdown";
import {SciMarkdown} from "./Chat/SciMarkdown.tsx";
import {TaskStatusCard} from "../Widgets/TaskStatusCard.jsx";
import {Button} from "../UI/Button.jsx";
import {Card, CardContent, CardHeader} from "../UI/Card.jsx";
import AreaLoadingSpinner from "../Widgets/AreaLoadingSpinner.jsx";
import WorkspacesList from "../Widgets/WorkspacesList.jsx";
import LazyLucideIcon from "../UI/LazyLucideIcon.jsx";
import Spreadsheet from "../Widgets/Spreadsheet.jsx";
import DocumentImageViewer from "../Widgets/DocumentImageViewer.jsx";
import DocMatrix from "../Widgets/DocMatrix.jsx";
import DatasetManager from "./Datasets/DatasetManager.jsx";
import {timestampToString, formatFileSize, sessionStorageStateInit} from "../../lib/utils.ts";
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip as ChartJsTooltip,
    Legend,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title as ChartJsTitle
} from 'chart.js';
import {DEBUG_MODE, DEFAULT_APPS, UI_CONSTANTS} from "../../constants/AppConstants";
import {ErrorBoundary} from "react-error-boundary";
import AppsIconGrid from "./AppsIconGrid.jsx";
import AppsList from "./AppsList.jsx";
import SelectWorkspacePrompt from "../Workspaces/SelectWorkspacePrompt.jsx";
import SelectApplicationPrompt from "./SelectApplicationPrompt.jsx";
import RefreshButton from "../UI/RefreshButton.jsx";

// Phase 2 widgets
import {StatusBadge} from "../Widgets/StatusBadge.jsx";
import {Badge} from "../Widgets/Badge.jsx";
import {ConfirmDialog} from "../Widgets/ConfirmDialog.jsx";
import {Tabs} from "../Widgets/Tabs.jsx";
import {DropdownMenu} from "../Widgets/DropdownMenu.jsx";
import {EmptyState} from "../Widgets/EmptyState.jsx";
import {SearchInput} from "../Widgets/SearchInput.jsx";

// shadcn/ui primitives
import {Collapsible, CollapsibleTrigger, CollapsibleContent} from "../ui/collapsible";
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger} from "../ui/dialog";
import {Input} from "../ui/input";
import {ScrollArea, ScrollBar} from "../ui/scroll-area";
import {Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue} from "../ui/select";
import {Separator} from "../ui/separator";
import {Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger} from "../ui/sheet";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "../ui/tooltip";

// Chat-layer components exposed to dynamic JSX
import {ArtifactPanel} from "./Chat/ArtifactPanel";
import {MessageBubble} from "./Chat/MessageBubble";
import {PlanningDisplay} from "./Chat/PlanningDisplay";
import {ReasoningDisplay} from "./Chat/ReasoningDisplay";

// Phase 2 hooks
import {usePolling} from "../../hooks/usePolling.jsx";
import {useRpc} from "../../hooks/useRpc.jsx";
import {useRpcMutation} from "../../hooks/useRpcMutation.jsx";
import {usePagination} from "../../hooks/usePagination.jsx";
import {useLocalStorage} from "../../hooks/useLocalStorage.jsx";

// Toast access for dynamic JSX
import {useToasts} from "../../hooks/useToasts.jsx";

// Theme access for dynamic JSX
import {useTheme} from "../../contexts/ThemeContext.jsx";

// Register Chart.js components
ChartJS.register(ArcElement, ChartJsTooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, ChartJsTitle);

// Patched React for the react-live eval scope.
// react-live uses Sucrase's classic JSX transform, which adds __self and __source
// dev-only props to every React.createElement call. React 19 detects __self in
// props and logs: "Your app ... is using an outdated JSX transform."
// Since these props are meaningless for dynamically eval'd JSX, stripping them
// before they reach the real createElement suppresses the warning safely.
// See: https://github.com/FormidableLabs/react-live/issues/405
const _patchedCreateElement = (type, config, ...children) => {
    if (config != null && '__self' in config) {
        const {__self, __source, ...rest} = config;
        return React.createElement(type, rest, ...children);
    }
    return React.createElement(type, config, ...children);
};
const LiveScopeReact = new Proxy(React, {
    get(target, prop, receiver) {
        if (prop === 'createElement') return _patchedCreateElement;
        return Reflect.get(target, prop, receiver);
    }
});

// Explicit references for Components available for dynamic rendering
const components = {
    // Graphing
    Pie,
    Line,

    // Internal App Components
    FileBrowser,
    DataProviderManager,
    WorkspaceSharing,
    WorkspacesList,
    // NewWorkspaceModal,
    SelectWorkspacePrompt,
    SelectApplicationPrompt,
    AppsIconGrid,
    AppsList,

    // Generic Components
    FileUpload,
    FileDownload,
    LazyLucideIcon,
    GenericTable,
    Markdown: SciMarkdown,
    AnnotatedMarkdown,
    TaskStatusCard,
    Button,
    Card,
    CardContent,
    CardHeader,
    RefreshButton,
    Spreadsheet,
    DocumentImageViewer,
    DatasetManager,
    DocMatrix,

    AreaLoadingSpinner,

    // Phase 2 widgets
    StatusBadge,
    Badge,
    ConfirmDialog,
    Tabs,
    DropdownMenu,
    EmptyState,
    SearchInput,

    // shadcn/ui primitives (new — do not conflict with legacy Button/Card/Badge/DropdownMenu/Tabs)
    Collapsible, CollapsibleTrigger, CollapsibleContent,
    Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger,
    Input,
    ScrollArea, ScrollBar,
    Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
    SelectScrollDownButton, SelectScrollUpButton, SelectSeparator,
    SelectTrigger, SelectValue,
    Separator,
    Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter,
    SheetHeader, SheetTitle, SheetTrigger,
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,

    // Chat-layer components
    ArtifactPanel, MessageBubble, PlanningDisplay, ReasoningDisplay,


};

const DynamicJSXRenderer = ({componentId}) => {
    const {dynamicJSXContent, sendRpcRequest, registerAppListener} = useWebSocket();

    // Pull reactive slices from the Zustand stores.
    const userInfo = useAuthStore(s => s.userInfo);
    const currentTenant = useAuthStore(s => s.currentTenant);
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const currentWorkspaceInfo = useWorkspaceStore(s => s.currentWorkspaceInfo);
    const mainPanel = useAppPanelStore(s => s.main);
    const secondaryPanel = useAppPanelStore(s => s.secondary);
    const appQueryParams = useAppPanelStore(s => s.appQueryParams);
    const appHash = useAppPanelStore(s => s.appHash);
    const appPath = useAppPanelStore(s => s.appPath);
    const latestAppStatus = useAppPanelStore(s => s.latestAppStatus);

    const content = dynamicJSXContent?.[componentId];
    const {jsxTemplate, contextData} = content;

    // Expose addToast to dynamic JSX via stable ref
    const {addToast} = useToasts();
    const addToastRef = useRef(addToast);
    useEffect(() => { addToastRef.current = addToast; }, [addToast]);
    const addToastStable = useCallback((msg, type, dur) => addToastRef.current(msg, type, dur), []);

    // Expose theme controls to dynamic JSX via stable refs
    const {setTheme, resetTheme, getToken} = useTheme();
    const setThemeRef = useRef(setTheme);
    const resetThemeRef = useRef(resetTheme);
    const getTokenRef = useRef(getToken);
    useEffect(() => { setThemeRef.current = setTheme; }, [setTheme]);
    useEffect(() => { resetThemeRef.current = resetTheme; }, [resetTheme]);
    useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
    const setThemeStable = useCallback((overrides) => setThemeRef.current(overrides), []);
    const resetThemeStable = useCallback(() => resetThemeRef.current(), []);
    const getThemeTokenStable = useCallback((key) => getTokenRef.current(key), []);

    // --- stable file upload wrapper ---
    const {uploadFile: _uploadFile} = useFileUploader(currentWorkspaceId);
    const uploadFileRef = useRef(_uploadFile);
    useEffect(() => { uploadFileRef.current = _uploadFile; }, [_uploadFile]);
    const uploadFileStable = useCallback((opts) => uploadFileRef.current(opts), []);

    // --- stable RPC wrapper ---
    const rpcEnvRef = useRef({
        sendRpcRequest,
        appId: componentId,
        workspaceId: currentWorkspaceId,
    })
    useEffect(() => {
        rpcEnvRef.current.sendRpcRequest = sendRpcRequest
    }, [sendRpcRequest])
    useEffect(() => {
        rpcEnvRef.current.appId = componentId
    }, [componentId])
    useEffect(() => {
        rpcEnvRef.current.workspaceId = currentWorkspaceId
    }, [currentWorkspaceId])

    const rpcToolCall = useCallback((func_name, args) => {
        const {sendRpcRequest, appId, workspaceId} = rpcEnvRef.current
        return sendRpcRequest(USER.TOOL_CALL, {
            appId, workspaceId, arguments: {[func_name]: args},
        })
    }, []) // <- no deps, identity never changes

    const switchWorkspace = useCallback((workspaceId) => {
        return useWorkspaceStore.getState().setCurrentWorkspace(workspaceId);
    }, []) // <- no deps, identity never changes

    const switchApplication = useCallback((appId) => {
        return useAppPanelStore.getState().loadApp({
            id: appId, type: appId, title: "scitrera.ai",
        });
    }, []) // <- no deps, identity never changes

    const switchApplication2 = useCallback((appId) => {
        if (appId === null) {
            return useAppPanelStore.getState().closeApp2();
        }
        const payload = appId === UI_CONSTANTS.APP_ID_CHAT
            ? DEFAULT_APPS.DEFAULT_CHAT_APP
            : {id: appId, type: appId, title: "scitrera.ai"};
        return useAppPanelStore.getState().loadApp2(payload);
    }, []) // <- no deps, identity never changes

    const setSidebarCollapsedState = useCallback((sidebarState) => {
        return useUIStore.getState().toggleSidebar(sidebarState);
    }, []) // <- no deps, identity never changes

    const configureWorkspace = useCallback((payload) => {
        return useWorkspaceStore.getState().setCurrentWorkspaceCustom(payload);
    }, []) // <- no deps, identity never changes

    const refreshContent = useCallback(() => {
        const {sendRpcRequest, appId, workspaceId} = rpcEnvRef.current
        return sendRpcRequest(DYNAMIC_JSX.CONTENT, {
            appId, workspaceId
        })
    }, []) // <- no deps, identity never changes

    // --- stable registerAppListener wrapper ---
    const regRef = useRef(registerAppListener)
    useEffect(() => {
        regRef.current = registerAppListener
    }, [registerAppListener])
    const registerAppListenerStable = useCallback((type, handler) => {
        return regRef.current(type, handler)
    }, []) // <- no deps

// --- stable URL helpers (if dynamic JSX uses them) ---
    const getAppQueryParameterStable = useCallback((k) => getAppQueryParameter(k), [])
    const setAppQueryParameterStable = useCallback((k, v) => setAppQueryParameter(k, v), [])

    // const hasContextField =
    //     content ? Object.prototype.hasOwnProperty.call(content, 'contextData') : false;

    // --- produce the latest bindings as a plain object (can still be “large”) ---
    const latestBindings = useMemo(() => ({
        ...contextData,

        appId: mainPanel?.id,
        app2Id: secondaryPanel?.id,
        componentId,

        workspace: currentWorkspaceId,
        currentUserId: userInfo?.id,
        currentUserEmail: userInfo?.email,
        currentUserRole: currentWorkspaceInfo?.role,
        currentUserPermissions: userInfo?.permissions,

        // include these only if your dynamic templates actually use them
        appQueryParams,
        appHash,
        appPath,
        latestAppStatus,

        idPrefix: `${userInfo?.email || ''}|${currentWorkspaceId || ''}|${componentId}`.toLowerCase(),
    }), [
        contextData, componentId,
        currentWorkspaceId,
        currentTenant, // tenant change should also force all dynamic JSX effects, etc.
        mainPanel?.id,
        secondaryPanel,
        userInfo?.id, userInfo?.email, userInfo?.permissions,
        currentWorkspaceInfo?.role,
        appQueryParams, appHash, appPath,
        latestAppStatus,
    ]);

    // Optional: smooth out very chatty updates
    const deferredBindings = useDeferredValue(latestBindings);

    // --- keep a ref with the “current” bindings and expose a stable Proxy ---
    const bindingsRef = useRef({});
    useEffect(() => {
        const cur = bindingsRef.current
        // remove keys that no longer exist
        for (const k of Object.keys(cur)) {
            if (!(k in deferredBindings)) delete cur[k]
        }
        // copy new/updated keys
        Object.assign(cur, deferredBindings)
    }, [deferredBindings])


    // Stable proxy that always reads from bindingsRef.current
    const bindingsProxy = useMemo(() => new Proxy({}, {
        get: (_target, prop) => bindingsRef.current[prop],
        has: (_target, prop) => prop in bindingsRef.current,
        ownKeys: () => Reflect.ownKeys(bindingsRef.current),
        getOwnPropertyDescriptor: (_t, prop) =>
            Object.getOwnPropertyDescriptor(bindingsRef.current, prop),
    }), []); // identity never changes

    const transformCode = useCallback((src) => {
        // Start with a safe string
        let s = (src ?? '');

        // 1) Prefix a newline so inline-mode "return" can't glue to the first token.
        if (!s.startsWith('\n') && !s.startsWith(';')) s = '\n' + s;

        // 2) Normalize any bare `returnX` to `return X` just in case.
        // Note: this is the critical component that we NEED
        s = s.replace(/\breturn(?![\s;])/g, 'return ');

        // TODO: fix this guard strategy because it would be convenient
        //
        //       // 3) If this is our expected anonymous component "() => { ... }",
        //       //    inject a guard immediately after the opening brace.
        //       const guard = `
        //   const __ctx = (typeof contextData !== 'undefined' && contextData) || {};
        //   const __ws = __ctx.workspaceId ?? (typeof workspaceId !== 'undefined' ? workspaceId : null);
        //   const __loaded = !!__ctx.__ctxLoaded;
        //   if (__ws == null || !__loaded) {
        //     return <AreaLoadingSpinner/>;
        //   }
        // `;
        //
        // // Only inject for the canonical arrow-function shape
        // s = s.replace(/^\s*\(\s*\)\s*=>\s*{/, (m) => m + guard);

        return s;
    }, []);


    // build scope ONCE; only include stable things
    const scopeRef = useRef()
    if (!scopeRef.current) {
        scopeRef.current = {
            // Patched React that suppresses the outdated JSX transform warning
            // (overrides react-live's internal React in the eval scope)
            React: LiveScopeReact,

            // React hooks are stable by identity
            useState, useEffect, useRef, useMemo, useCallback, useDeferredValue,
            createPortal, // to allow portals if needed

            // components mapping is a module-level const
            ...components,

            // stable wrappers
            rpcToolCall, // do async rpc call (promise)
            uploadFile: uploadFileStable, // file upload (pre-signed URL + XHR)
            configureWorkspace, // dispatch workspace w/ custom definition
            switchWorkspace, // dispatch workspace by id
            switchApplication, // set main application (by id)
            switchApplication2, // set 2nd application (by id), chat expected for now
            refreshContent, // request dynamic JSX update
            setSidebarCollapsedState, // set (or toggle) sidebar state
            registerAppListener: registerAppListenerStable, // register listener for routing messages to the app
            getAppQueryParameter: getAppQueryParameterStable, // get query parameters
            setAppQueryParameter: setAppQueryParameterStable, // set query parameters

            // toast notifications
            addToast: addToastStable,

            // theme controls
            setTheme: setThemeStable,
            resetTheme: resetThemeStable,
            getThemeToken: getThemeTokenStable,

            // Phase 2 hooks for JSX authors
            usePolling, useRpc, useRpcMutation, usePagination, useLocalStorage,

            // tiny pure utils that don’t change identity
            DEBUG_MODE, timestampToString, formatFileSize, sessionStorageStateInit,
            USER, CHAT, WORKSPACE,

            // your live state goes through the proxy
            contextData: bindingsProxy,
        }
    }

    // Clean code only when the template changes
    const cleanedJsx = useMemo(() => {
        if (!jsxTemplate) return '';
        return jsxTemplate.trim().replace(/>\s+</g, '><');
    }, [jsxTemplate]);


    return (<div
        className="dynamic-jsx-container w-full h-full p-4 bg-gray-50 rounded-lg min-w-0 min-h-0 overflow-x-auto overflow-y-auto">
        <ErrorBoundary fallbackRender={({error, resetErrorBoundary}) => (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <p className="text-red-500 font-semibold mb-2">Application Error</p>
                <p className="text-sm text-gray-500 mb-4">{error?.message || 'An error occurred rendering this application.'}</p>
                <button
                    onClick={resetErrorBoundary}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
                >
                    Reload App
                </button>
            </div>
        )} onReset={refreshContent}>
            <LiveProvider
                code={cleanedJsx}
                scope={scopeRef.current}
                transformCode={transformCode}
                enableTypeScript={false}
                disabled={!DEBUG_MODE}
            >
                <div className="w-full h-full min-h-0 min-w-0 overflow-hidden flex flex-col">
                    <LivePreview className="w-full h-full min-h-0 min-w-0"/>
                </div>
                {/*<LiveEditor></LiveEditor>*/}
                <LiveError className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm font-mono whitespace-pre-wrap"/>
            </LiveProvider>
        </ErrorBoundary>
    </div>);
};

export default React.memo(DynamicJSXRenderer);
