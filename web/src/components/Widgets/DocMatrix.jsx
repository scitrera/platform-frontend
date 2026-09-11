import React, {useState, useEffect, useRef} from 'react';
import LazyLucideIcon from '../UI/LazyLucideIcon';
import {SciMarkdown} from "../Apps/Chat/SciMarkdown.tsx";
import {useAuthStore} from '@/stores/authStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {DEBUG_MODE, PERMISSIONS_ENUMS as Roles} from "../../constants/AppConstants";
import {timestampToString, generateUUID} from "@/lib/utils.ts";
import GenericLoadDialog from './GenericLoadDialog.jsx';

// Extracted outside DocMatrix to prevent remount on every parent re-render
const ColumnImportSelector = ({isOpen, onClose, onImport, sourceMatrix, loadMatrix, workspace}) => {
    const [columns, setColumns] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && sourceMatrix) {
            setLoading(true);
            (async () => {
                try {
                    const def = await loadMatrix(workspace, sourceMatrix.id);
                    setColumns(def?.columns || []);
                } catch (e) {
                    console.error('Failed to load source matrix for import:', e);
                    setColumns([]);
                } finally {
                    setLoading(false);
                }
            })();
        } else {
            setColumns([]);
            setSelectedIds(new Set());
        }
    }, [isOpen, sourceMatrix, loadMatrix, workspace]);

    const toggleSelection = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleImport = () => {
        const colsToImport = columns.filter(c => selectedIds.has(c.id));
        onImport(colsToImport);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-[500px] max-w-full">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Import Columns</h3>
                <p className="text-sm text-slate-500 mb-4">Select columns from <span
                    className="font-semibold">{sourceMatrix?.name}</span> to add to your current matrix.</p>
                <div className="border border-slate-200 rounded-lg max-h-[300px] overflow-y-auto mb-4">
                    {loading ?
                        <div className="p-8 flex justify-center"><LazyLucideIcon iconName="Loader2"
                                                                                 className="animate-spin text-slate-400"/>
                        </div> : columns.length === 0 ?
                            <div className="p-8 text-center text-slate-400 text-sm">No columns found.</div> : (
                                columns.map(col => (
                                    <div key={col.id} onClick={() => toggleSelection(col.id)}
                                         className={`p-3 border-b border-slate-100 last:border-0 flex items-start gap-3 cursor-pointer hover:bg-slate-50 ${selectedIds.has(col.id) ? 'bg-indigo-50/50' : ''}`}>
                                        <div
                                            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center ${selectedIds.has(col.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>{selectedIds.has(col.id) &&
                                            <LazyLucideIcon iconName="Check" size={10}/>}</div>
                                        <div>
                                            <div className="text-sm font-medium text-slate-800">{col.header}</div>
                                            <div
                                                className="text-xs text-slate-400 line-clamp-1">{col.promptText}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose}
                            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md">Cancel
                    </button>
                    <button onClick={handleImport} disabled={selectedIds.size === 0}
                            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">Import {selectedIds.size} Columns
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function DocMatrix({
                                      initialWorkspace = null, // meant to be paired with initialMatrixId to allow initial loading
                                      initialMatrixId = null,  // to load a particular matrix at load-time
                                      // Backend Functions
                                      onListMatricesInWorkspace,
                                      onLoadMatrix,
                                      onRunAnalysis,
                                      onSaveMatrix,
                                      onFetchMatrixState,
                                      onToggleMatrixReadOnly,
                                      onUploadDocument,
                                      onCheckBatchStatus,
                                      onInitiateDiscussion,
                                      onListAvailableWorkspaces = null,
                                      onSelectExistingData, // optional
                                      onAddSource // optional
                                  }) {
    const userInfo = useAuthStore(s => s.userInfo);
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const currentWorkspaceInfo = useWorkspaceStore(s => s.currentWorkspaceInfo);
    const workspacesNav = useWorkspaceStore(s => s.workspaces);

    const workspace = initialWorkspace || currentWorkspaceId || 'workspace-missing';

    // Legacy appState-shaped object retained for local helper usage below so that
    // existing call sites (e.g., fetchUserProfile) continue to read the same keys.
    const appState = {
        userInfo,
        currentWorkspaceId,
        currentWorkspaceInfo,
        workspaces: workspacesNav,
    };

    const fetchUserProfile = (appState) => {
        return {
            id: appState.userInfo?.id,
            email: appState.userInfo?.email,
            role: appState.currentWorkspaceInfo?.role,
        }
    }

    // region Backend Functions (Mapped from Props)

    // List Available Workspaces (will automatically include all shared and private workspaces if not specified)
    const listAvailableWorkspaces = onListAvailableWorkspaces ? onListAvailableWorkspaces : async () => {
        return [
            ...appState.workspaces.shared,
            ...appState.workspaces.private,
        ];
    };
    const listMatricesInWorkspace = onListMatricesInWorkspace;
    const loadMatrix = onLoadMatrix;
    const runAnalysis = onRunAnalysis;
    const saveMatrix = onSaveMatrix;
    // endregion

    // region Actions & Permissions Mappings
    const fetchMatrixState = onFetchMatrixState;
    const toggleMatrixReadOnly = onToggleMatrixReadOnly;

    const uploadDocumentStub = onUploadDocument;
    const checkBatchStatusStub = onCheckBatchStatus;
    const initiateDiscussionStub = onInitiateDiscussion;
    const selectExistingDataStub = onSelectExistingData;
    const addSourceStub = onAddSource;

    // GenericLoadDialog adapters
    const listWorkspacesForDialog = async () => {
        const ws = await listAvailableWorkspaces();
        return (ws || []).map(w => ({
            ...w,
            name: w.name || w.label || w.title || `Workspace ${w.id}`
        }));
    };

    const listMatricesForDialog = async (wsId) => {
        if (!listMatricesInWorkspace) return [];
        const list = await listMatricesInWorkspace(wsId);
        return (list || []).map(m => ({
            ...m,
            name: m.name || m.label || `Matrix ${m.id}`,
            updatedAt: m.updatedAt || m.updated || m.lastUpdated || null
        }));
    };

    const triggerFileDialog = () => {
        if (isReadOnly || isProcessing) return;
        closeAddDocsMenu();
        if (fileInputRef?.current) {
            fileInputRef.current.click();
        }
    };

    // endregion

    // region Components

    /**
     * COMPONENT: Floating Editor
     */
    const ColumnEditor = ({column, position, onSave, onDelete, onCancel}) => {
        const [header, setHeader] = useState(column.header);
        const [promptText, setPromptText] = useState(column.promptText);

        return (
            <div
                className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 w-80 p-4 animate-in fade-in zoom-in-95 duration-200"
                style={{top: position.top + 10, left: position.left}}
            >
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Edit Column</h3>
                    <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
                        <LazyLucideIcon iconName="X" size={16}/>
                    </button>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-slate-500 uppercase">Header Name</label>
                        <input
                            type="text"
                            value={header}
                            onChange={(e) => setHeader(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 text-sm border rounded bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 uppercase">System Prompt</label>
                        <textarea
                            rows={3}
                            value={promptText}
                            onChange={(e) => setPromptText(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 text-sm border rounded bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        />
                    </div>
                    <div
                        className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700 mt-2">
                        <button
                            onClick={() => onDelete(column.id, header)}
                            className="px-2 py-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded text-xs font-medium flex items-center gap-1 transition-colors"
                        >
                            <LazyLucideIcon iconName="Trash2" size={14}/> Delete
                        </button>
                        <button
                            onClick={() => onSave(column.id, header, promptText)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                        >
                            Update Column
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    /**
     * COMPONENT: Cell Action Menu
     */
    const CellActionMenu = ({position, onCopy, onDiscuss}) => {
        return (
            <div
                className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 w-48 py-1 animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
                style={{top: position.top + 5, left: position.left}}
            >
                <button
                    onClick={onCopy}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                    <LazyLucideIcon iconName="Clipboard" size={16} className="text-slate-400"/>
                    Copy Text
                </button>
                <button
                    onClick={onDiscuss}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors border-t border-slate-100"
                >
                    <LazyLucideIcon iconName="MessageSquare" size={16} className="text-indigo-500"/>
                    Discuss
                </button>
            </div>
        );
    };

    /**
     * COMPONENT: Generic Confirmation Modal
     */
    const ConfirmationModal = ({
                                   isOpen,
                                   onClose,
                                   onConfirm,
                                   title,
                                   message,
                                   confirmText = "Confirm",
                                   confirmStyle = "danger"
                               }) => {
        if (!isOpen) return null;

        const btnClass = confirmStyle === 'danger'
            ? "bg-red-600 hover:bg-red-700 text-white"
            : "bg-blue-600 hover:bg-blue-700 text-white";

        return (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl p-6 w-96 max-w-full m-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{message}</p>
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose}
                                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md">
                            Cancel
                        </button>
                        <button onClick={onConfirm} className={`px-4 py-2 text-sm rounded-md shadow-sm ${btnClass}`}>
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    /**
     * COMPONENT: Matrix Browser Dialog
     */
    const MatrixBrowserDialog = ({isOpen, onClose, onSelect, mode = 'OPEN'}) => {
        const [workspaces, setWorkspaces] = useState([]);
        const [selectedWs, setSelectedWs] = useState(null);
        const [files, setFiles] = useState([]);
        const [loading, setLoading] = useState(false);
        const wsListRef = useRef(null);
        const wsItemRefs = useRef({});

        useEffect(() => {
            if (isOpen) {
                setLoading(true);
                listAvailableWorkspaces().then(data => {
                    setWorkspaces(data);
                    if (data.length > 0) setSelectedWs(workspace || data[0].id);
                    setLoading(false);
                });
            }
        }, [isOpen]);

        useEffect(() => {
            if (selectedWs) {
                // Scroll the selected workspace into view within the list
                const el = wsItemRefs.current[selectedWs];
                if (el && wsListRef.current && typeof el.scrollIntoView === 'function') {
                    try {
                        el.scrollIntoView({block: 'start', behavior: 'smooth'});
                        // eslint-disable-next-line no-unused-vars
                    } catch (_) {
                        // fallback without options for older browsers/environments
                        el.scrollIntoView();
                    }
                }

                setLoading(true);
                listMatricesInWorkspace(selectedWs).then(data => {
                    // Sort by updated timestamp desc (newest first)
                    const sorted = Array.isArray(data)
                        ? [...data].sort((a, b) => {
                            const ta = a && a.updated ? a.updated : 0;
                            const tb = b && b.updated ? b.updated : 0;
                            return tb - ta; // desc
                        })
                        : [];
                    setFiles(sorted);
                    setLoading(false);
                });
            }
        }, [selectedWs]);

        if (!isOpen) return null;

        return (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                <div
                    className="bg-white rounded-xl shadow-2xl w-[600px] max-w-full flex flex-col h-[500px] overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-800">{mode === 'OPEN' ? 'Open Matrix' : 'Select Source Matrix'}</h3>
                        <button onClick={onClose}><LazyLucideIcon iconName="X" size={20}
                                                                  className="text-slate-400 hover:text-slate-600"/>
                        </button>
                    </div>
                    <div className="flex flex-1 overflow-hidden">
                        <div ref={wsListRef}
                             className="w-1/3 border-r border-slate-100 bg-slate-50/50 overflow-y-auto p-2">
                            {/* Consider if we want to use WorkspacesList (or adapt it to support use here */}
                            <div className="text-xs font-semibold text-slate-400 uppercase mb-2 px-2">Workspaces</div>
                            {/* Consider if we need a search box here */}
                            {workspaces.map(ws => (
                                <button
                                    key={ws.id}
                                    ref={el => {
                                        if (el) wsItemRefs.current[ws.id] = el;
                                    }}
                                    onClick={() => setSelectedWs(ws.id)}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm mb-1 ${selectedWs === ws.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    {ws.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {loading ? (
                                <div className="flex items-center justify-center h-full text-slate-400 gap-2">
                                    <LazyLucideIcon iconName="Loader2"
                                                    className="animate-spin" size={20}/> Loading...</div>
                            ) : (
                                <div className="space-y-2">
                                    {files.map(file => (
                                        <div key={file.id} onClick={() => onSelect(file)}
                                             className="group flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer transition-all">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-indigo-100 text-indigo-600 p-2 rounded">
                                                    <LazyLucideIcon iconName="Database"
                                                                    size={16}/></div>
                                                <div>
                                                    <div
                                                        className="font-medium text-slate-800 text-sm group-hover:text-indigo-700">{file.name}</div>
                                                    <div
                                                        className="text-xs text-slate-400">{timestampToString(file.updated)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {files.length === 0 &&
                                        <div className="text-center text-slate-400 text-sm mt-10">No matrices
                                            found.</div>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    /**
     * COMPONENT: Column Import Selector
     */
    // endregion (ColumnImportSelector extracted to module scope above)

    // region --- State Data ---

    // --- State: Meta & User ---
    const [currentUser, setCurrentUser] = useState(fetchUserProfile(appState) || null);
    const [meta, setMeta] = useState({
        id: initialMatrixId || generateUUID(),
        name: 'Untitled Matrix',
        workspace: workspace,  // default workspace should be current workspace
        lastUpdated: new Date(),
        revision: 0
    });

    // --- State: Status & Permissions ---
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [permissions, setPermissions] = useState({canWrite: true, canManageLock: false});
    const [isProcessing, setIsProcessing] = useState(false);

    // --- State: Configuration (Serializable) ---
    const [documents, setDocuments] = useState([]);
    const [prompts, setPrompts] = useState([
        // {id: generateUUID(), header: 'Summary', promptText: 'Summarize this document in 1 sentence.'},
        // {id: generateUUID(), header: 'Key Entities', promptText: 'Extract names and organizations.'}
    ]);

    // --- State: Data & UI ---
    const [results, setResults] = useState({});
    const [dragActive, setDragActive] = useState(false);

    // Modals & Editors
    const [deleteModal, setDeleteModal] = useState({isOpen: false, type: 'DOC', targetId: null, name: ''});
    const [editingCol, setEditingCol] = useState(null);
    const [browserModal, setBrowserModal] = useState({isOpen: false, mode: 'OPEN'});
    const [importColModal, setImportColModal] = useState({isOpen: false, sourceMatrix: null});
    const [lockConfirmModal, setLockConfirmModal] = useState({isOpen: false, action: 'LOCK'}); // LOCK | UNLOCK
    const [revisionConflictModal, setRevisionConflictModal] = useState({isOpen: false, message: ''});
    const [activeCellMenu, setActiveCellMenu] = useState(null); // { top, left, content, docId, promptId }

    // Dragging Columns State
    const [draggedColId, setDraggedColId] = useState(null);
    // Small Add Documents menu state and file input ref
    const [addDocsMenu, setAddDocsMenu] = useState(null); // { top, left } | null
    const fileInputRef = useRef(null);
    // Document picker modal (workspace files for "Add Documents")
    const [docPickerModal, setDocPickerModal] = useState({isOpen: false, files: [], loading: false});

    // Transpose view state: false => Documents as rows (default), true => Documents as columns
    const [isTransposed, setIsTransposed] = useState(false);
    // UI-only saving indicator (separate from isSavingRef guard which doesn't trigger re-renders)
    const [isSavingUI, setIsSavingUI] = useState(false);

    // endregion

    // --- Helpers: Permissions, Definition build, and Persistence ---
    const computePermissions = (user, metaObj) => {
        const isOwner = user && metaObj && user.id && metaObj.ownerId && user.id === metaObj.ownerId;
        const isAdmin = user?.role === Roles.ADMIN;
        const canManageLock = !!(isAdmin || isOwner);
        // Write permission is independent from read-only state; UI will still block when read-only is true
        const canWrite = !!(isAdmin || isOwner);
        DEBUG_MODE && console.log('Computed permissions:', {isOwner, isAdmin, canWrite, canManageLock});
        return {canWrite, canManageLock};
    };

    const buildDefinitionPayload = (metaObj, docs, cols) => ({
        meta: {
            ...metaObj,
            // Persisted metadata lives inside definition
            workspace: metaObj.workspace,
            id: metaObj.id,
            name: metaObj.name,
            lastUpdated: metaObj.lastUpdated,
            ownerId: metaObj.ownerId,
            revision: typeof metaObj.revision === 'number' ? metaObj.revision : 0
        },
        documents: docs.map(d => ({id: d.id, name: d.name})),
        columns: cols
    });

    // Centralized save with optimistic update + rollback on failure
    // Accepts optional overrides to ensure we persist the exact data just applied optimistically.
    const persistMatrix = async (prevSnapshot = null, overrides = {}) => {
        let isConflict = false;
        // Prevent overlapping saves and clear any pending auto-save
        if (isSavingRef.current) {
            DEBUG_MODE && console.log('persistMatrix skipped: save already in progress');
            return false;
        }
        isSavingRef.current = true;
        setIsSavingUI(true);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        try {
            const docs = overrides.documents ?? documents;
            const cols = overrides.prompts ?? prompts;
            const payload = buildDefinitionPayload(latestMetaRef.current || meta, docs, cols);
            DEBUG_MODE && console.log('persistMatrix -> saving with revision', payload?.meta?.revision);
            const res = await saveMatrix(payload);
            isConflict = res && res.status === 'revision_mismatch';
            if (isConflict) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('Revision conflict detected from backend.');
            }
            // If backend returns authoritative metadata (e.g., ownerId), merge it
            if (res && res.meta) {
                DEBUG_MODE && console.log("matrix save response", res);
                setMeta(prev => ({
                    ...prev,
                    ...(res.meta || {}),
                    // ...(res.ownerId ? {ownerId: res.ownerId} : {}),
                    // ...(typeof (res.revision) === 'number' ? {revision: res.revision} : {}),
                    // ...(typeof (res.meta?.revision) === 'number' ? {revision: res.meta.revision} : {}),
                    lastUpdated: res.meta?.lastUpdated ? new Date(res.meta.lastUpdated) : new Date()
                }));
                // Ensure our latestMetaRef also reflects fresh metadata immediately
                latestMetaRef.current = {
                    ...latestMetaRef.current,
                    ...(res.meta || {}),
                    lastUpdated: res.meta?.lastUpdated ? new Date(res.meta.lastUpdated) : new Date()
                };
            } else {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('Invalid response from saveMatrix backend.');
            }
            // else {
            //     setMeta(prev => ({...prev, lastUpdated: new Date()}));
            // }
            return true;
        } catch (e) {
            if (prevSnapshot) {
                const {prevMeta, prevDocs, prevPrompts, prevResults} = prevSnapshot;
                if (prevMeta) setMeta(prevMeta);
                if (prevDocs) setDocuments(prevDocs);
                if (prevPrompts) setPrompts(prevPrompts);
                if (prevResults) setResults(prevResults);
            }
            DEBUG_MODE && console.error('Failed to save matrix definition:', e);
            if (isConflict) {
                setRevisionConflictModal({
                    isOpen: true,
                    message: 'This matrix has been updated elsewhere. Please reload to get the latest version. Your local changes were not saved.'
                });
            }
            return false;
        } finally {
            isSavingRef.current = false;
            setIsSavingUI(false);
            // Clear any stray timeout just in case
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        }
    };

    // --- Initialization ---
    useEffect(() => {
        const init = async () => {
            const user = fetchUserProfile(appState);
            setCurrentUser(user);

            let loadedMeta = meta;
            if (initialMatrixId && loadMatrix) {
                try {
                    const def = await loadMatrix(workspace, initialMatrixId);
                    if (def) {
                        // Prevent an immediate auto-save caused by the state updates from loading
                        // Use the saving guard so the auto-save effect bails while we apply loaded state
                        skipNextAutosaveRef.current = true; // keep legacy one-shot skip (belt-and-suspenders)
                        if (!isSavingRef.current) {
                            DEBUG_MODE && console.log('Load guard: setting isSavingRef=true before applying loaded state');
                            isSavingRef.current = true;
                        }
                        if (saveTimeoutRef?.current) {
                            clearTimeout(saveTimeoutRef.current);
                            saveTimeoutRef.current = null;
                        }
                        const nextMeta = {
                            ...(def.meta || {}),
                            workspace: def.meta?.workspace || workspace,
                            id: def.meta?.id || initialMatrixId,
                            name: def.meta?.name || 'Untitled Matrix',
                            lastUpdated: def.meta?.lastUpdated ? new Date(def.meta.lastUpdated) : new Date(),
                            revision: typeof def.meta?.revision === 'number' ? def.meta.revision : 0
                        };
                        setMeta(nextMeta);
                        setDocuments(Array.isArray(def.documents) ? def.documents : []);
                        setPrompts(Array.isArray(def.columns) ? def.columns : []);
                        setResults({});
                        loadedMeta = nextMeta;
                        // Release the guard on the next tick to allow state to settle first
                        setTimeout(() => {
                            DEBUG_MODE && console.log('Load guard: releasing isSavingRef after initial load state applied');
                            isSavingRef.current = false;
                        }, 0);
                    }
                } catch (e) {
                    DEBUG_MODE && console.error('Failed to load initial matrix definition', e);
                }
            }

            // Load initial state for the matrix (read-only + processing only)
            const state = await fetchMatrixState(loadedMeta.id);
            setIsReadOnly(state.isReadOnly);
            setIsProcessing(state.isProcessing);
            // Permissions are computed locally from user + ownership, not fetched from server state
            setPermissions(computePermissions(user, loadedMeta, state.isReadOnly));
            DEBUG_MODE && console.log("User", user, "Matrix Meta", loadedMeta, "Permissions", permissions);
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialMatrixId, appState]);

    // region --- Auto-Save Logic ---
    const saveTimeoutRef = useRef(null);
    // Prevent overlapping saves and stale metadata usage
    const isSavingRef = useRef(false);
    const latestMetaRef = useRef(meta);
    // Skip the very next auto-save that would be triggered immediately after loading
    const skipNextAutosaveRef = useRef(false);

    // Keep a ref in sync with meta so we can build payloads with the freshest revision
    useEffect(() => {
        latestMetaRef.current = meta;
    }, [meta]);

    useEffect(() => {
        // If we just loaded a matrix and set initial state, skip the first auto-save that would
        // otherwise be triggered by meta/documents/prompts updates from that load.
        if (skipNextAutosaveRef.current) {
            DEBUG_MODE && console.log('Auto-save skipped: just loaded, suppressing immediate post-load save');
            skipNextAutosaveRef.current = false;
            return;
        }

        // Only save if not read-only and no conflict modal
        if (isReadOnly || revisionConflictModal.isOpen) return;

        // Don't auto-save when matrix is completely empty (no documents and no columns)
        // This avoids creating empty matrices on initial load/refresh.
        if ((Array.isArray(documents) && documents.length === 0) && (Array.isArray(prompts) && prompts.length === 0)) {
            return;
        }

        // If a save is in-flight, don't queue another one yet
        if (isSavingRef.current) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            // Double-check just before firing
            if (!isSavingRef.current) {
                persistMatrix();
            }
        }, 2000);

        return () => clearTimeout(saveTimeoutRef.current);
        // dependency notes:
        //  exclude isReadOnly (we don't want to save on toggling read-only)
        //  exclude revisionConflictModal (we don't want to save just because conflict modal opens [or closes...])
    }, [documents, prompts, meta.name]);

    // endregion

    // Recompute permissions when user/ownership/read-only changes
    useEffect(() => {
        setPermissions(computePermissions(currentUser, meta, isReadOnly));
    }, [currentUser, meta.ownerId, isReadOnly]);

    // region --- Actions: Permissions & Locking ---

    const handleLockClick = () => {
        // Only owner/admin can toggle
        if (!permissions.canManageLock) return;

        setLockConfirmModal({
            isOpen: true,
            action: isReadOnly ? 'UNLOCK' : 'LOCK'
        });
    };

    const confirmLockToggle = async () => {
        const newStatus = lockConfirmModal.action === 'LOCK';

        // Optimistic UI update
        setIsReadOnly(newStatus);
        setLockConfirmModal({...lockConfirmModal, isOpen: false});

        // Backend call
        try {
            await toggleMatrixReadOnly(meta.id, newStatus);
        } catch {
            alert("Failed to update lock status");
            setIsReadOnly(!newStatus); // Revert
        }
    };

    // endregion

    // region --- Actions: Cell Interactions (Menu) ---

    const handleCellClick = (e, docId, promptId, content) => {
        // # TODO: allow operation during processing if this particular cell is ready.
        if (isProcessing) return; // Can't interact during processing
        // NOTE: We allow interaction in Read-Only mode (copying/discussing isn't editing)

        const rect = e.currentTarget.getBoundingClientRect();
        setActiveCellMenu({
            top: rect.bottom,
            left: rect.left,
            content,
            docId,
            promptId
        });
        e.stopPropagation(); // Prevent other clicks
    };

    const handleCopyCell = () => {
        if (activeCellMenu?.content) {
            navigator.clipboard.writeText(activeCellMenu.content).then(() => {
                // Optional toast could go here
                setActiveCellMenu(null);
            }).catch(err => {
                DEBUG_MODE && console.error('Failed to copy text: ', err);
            });
        }
    };

    const handleDiscussCell = async () => {
        if (activeCellMenu) {
            const {docId, promptId, content} = activeCellMenu;
            await initiateDiscussionStub(docId, promptId, content);
            alert("Discussion panel opened! (See console for details)");
            setActiveCellMenu(null);
        }
    };

    // endregion

    // region --- Actions: File Operations ---

    const handleNew = () => {
        // note: got rid of confirmation for now since we have auto-saving
        // TODO: ensure that save is up to date!
        // if (confirm("Create new matrix? Unsaved changes in the current view might be lost.")) {
        setMeta({
            id: generateUUID(),
            name: 'Untitled Matrix',
            workspace: workspace,  // default workspace should be the current workspace!
            lastUpdated: new Date(),
            revision: 0
        });
        setDocuments([]);
        setPrompts([{id: generateUUID(), header: 'Summary', promptText: 'Summarize...'}]);
        setResults({});
        setIsReadOnly(false);
        // }
    };

    const handleBrowserSelect = async (file, selectedWorkspaceId = null) => {
        setBrowserModal({...browserModal, isOpen: false});

        if (browserModal.mode === 'OPEN') {
            if (!loadMatrix) {
                DEBUG_MODE && console.error('onLoadMatrix prop is required to open an existing matrix.');
                return;
            }
            // Load full definition
            try {
                const wsToUse = selectedWorkspaceId || workspace;
                const def = await loadMatrix(wsToUse, file.id);
                // Guard against immediate auto-save while applying loaded state
                skipNextAutosaveRef.current = true; // one-shot skip for redundancy
                if (!isSavingRef.current) {
                    DEBUG_MODE && console.log('Open guard: setting isSavingRef=true before applying loaded state');
                    isSavingRef.current = true;
                }
                if (saveTimeoutRef?.current) {
                    clearTimeout(saveTimeoutRef.current);
                    saveTimeoutRef.current = null;
                }
                const nextMeta = {
                    ...(def?.meta || {}),
                    workspace: def?.meta?.workspace || wsToUse,
                    id: def?.meta?.id || file.id,
                    name: def?.meta?.name || file.name || 'Untitled Matrix',
                    lastUpdated: def?.meta?.lastUpdated ? new Date(def.meta.lastUpdated) : new Date(),
                    revision: typeof def?.meta?.revision === 'number' ? def.meta.revision : 0
                };
                setMeta(nextMeta);
                setDocuments(Array.isArray(def?.documents) ? def.documents : []);
                setPrompts(Array.isArray(def?.columns) ? def.columns : []);
                setResults({});
                // Release guard on next tick after state updates settle
                setTimeout(() => {
                    DEBUG_MODE && console.log('Open guard: releasing isSavingRef after open state applied');
                    isSavingRef.current = false;
                }, 0);
            } catch (e) {
                DEBUG_MODE && console.error('Failed to load matrix', e);
                // Fallback minimal meta if load failed
                setMeta({
                    id: file.id,
                    name: file.name,
                    workspace: selectedWorkspaceId || workspace,
                    lastUpdated: new Date(),
                    revision: 0
                });
                setDocuments([]);
                setPrompts([]);
                setResults({});
            }

            // Fetch new state for the loaded matrix (read-only + processing only)
            const state = await fetchMatrixState(file.id);
            setIsReadOnly(state.isReadOnly);
            setIsProcessing(state.isProcessing);
            setPermissions(computePermissions(currentUser, {
                ...meta,
                id: file.id
            }, state.isReadOnly));

        } else if (browserModal.mode === 'IMPORT') {
            setImportColModal({isOpen: true, sourceMatrix: file});
        }
    };

    const handleDuplicate = async () => {
        const newId = generateUUID();
        setMeta(prev => ({
            ...prev,
            id: newId,
            name: `Copy of ${prev.name}`,
            lastUpdated: new Date(),
            revision: 0
        }));
        // Duplicates are typically owned by creator, so unlocked
        setIsReadOnly(false);
        setPermissions({canWrite: true, canManageLock: true});
        // Persist duplicated definition explicitly
        await persistMatrix({
            prevMeta: {...meta},
            prevDocs: [...documents],
            prevPrompts: [...prompts],
            prevResults: {...results}
        });
        alert("Matrix duplicated! You are now working on the copy.");
    };

    const reloadFromServer = async () => {
        try {
            if (!loadMatrix) {
                alert('Reload is not available: backend loader missing.');
                return;
            }
            const def = await loadMatrix(workspace, meta.id);
            const nextMeta = {
                ...(def?.meta || {}),
                workspace: def?.meta?.workspace || workspace,
                id: def?.meta?.id || meta.id,
                name: def?.meta?.name || meta.name || 'Untitled Matrix',
                lastUpdated: def?.meta?.lastUpdated ? new Date(def.meta.lastUpdated) : new Date(),
                revision: typeof def?.meta?.revision === 'number' ? def.meta.revision : 0
            };
            setMeta(nextMeta);
            setDocuments(Array.isArray(def?.documents) ? def.documents : []);
            setPrompts(Array.isArray(def?.columns) ? def.columns : []);
            setResults({});

            const state = await fetchMatrixState(nextMeta.id);
            setIsReadOnly(state.isReadOnly);
            setIsProcessing(state.isProcessing);
            setPermissions(computePermissions(currentUser, nextMeta, state.isReadOnly));
        } catch (e) {
            DEBUG_MODE && console.error('Failed to reload matrix after revision conflict', e);
            alert('Failed to reload matrix. Please try again.');
        } finally {
            setRevisionConflictModal({isOpen: false, message: ''});
        }
    };

    const handleImportColumns = async (newCols) => {
        if (isReadOnly || isProcessing) return;
        const prevSnapshot = {
            prevMeta: {...meta},
            prevDocs: [...documents],
            prevPrompts: [...prompts],
            prevResults: {...results}
        };
        const processedCols = newCols.map(c => ({
            ...c,
            id: generateUUID()
        }));
        const nextPrompts = [...prompts, ...processedCols];
        setPrompts(nextPrompts);
        await persistMatrix(prevSnapshot, {prompts: nextPrompts});
    };

    const handleClearDocs = () => {
        if (isReadOnly || isProcessing) return;
        setDeleteModal({
            isOpen: true,
            type: 'CLEAR_ALL',
            targetId: null,
            name: 'ALL Documents',
            title: 'Clear Matrix?'
        });
    };

    // endregion

    // region --- Actions: Document Management ---

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isReadOnly || isProcessing) return;
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (isReadOnly || isProcessing) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const uploads = Array.from(e.dataTransfer.files).map(file => uploadDocumentStub(file));
            try {
                const newDocs = await Promise.all(uploads);
                const prevSnapshot = {
                    prevMeta: {...meta},
                    prevDocs: [...documents],
                    prevPrompts: [...prompts],
                    prevResults: {...results}
                };
                const nextDocs = [...documents, ...newDocs];
                setDocuments(nextDocs);
                await persistMatrix(prevSnapshot, {documents: nextDocs});
            } catch {
                alert("Failed to upload documents");
            }
        }
    };

    // endregion

    // region --- Add Documents: menu actions & file dialog ---

    // Open the document picker directly (fetches workspace files via onSelectExistingData)
    const openDocPicker = async () => {
        if (!selectExistingDataStub) return;
        setDocPickerModal({isOpen: true, files: [], loading: true});
        try {
            const files = await selectExistingDataStub();
            setDocPickerModal({isOpen: true, files: files || [], loading: false});
        } catch (e) {
            DEBUG_MODE && console.error('Failed to load available documents:', e);
            setDocPickerModal({isOpen: true, files: [], loading: false});
        }
    };

    const handleDocPickerSelect = async (file) => {
        setDocPickerModal(prev => ({...prev, isOpen: false}));
        const docEntry = {id: file.doc_id || file.name, name: file.name || file.path};
        // Skip if already in document list
        if (documents.some(d => d.id === docEntry.id)) return;
        const prevSnapshot = {
            prevMeta: {...meta},
            prevDocs: [...documents],
            prevPrompts: [...prompts],
            prevResults: {...results}
        };
        const nextDocs = [...documents, docEntry];
        setDocuments(nextDocs);
        await persistMatrix(prevSnapshot, {documents: nextDocs});
    };

    const openAddDocsMenu = (e) => {
        if (isReadOnly || isProcessing) return;
        // If only "Select Existing Data" is available, skip the menu and open picker directly
        if (!uploadDocumentStub && !addSourceStub && selectExistingDataStub) {
            openDocPicker();
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        setAddDocsMenu({
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX
        });
    };

    const closeAddDocsMenu = () => setAddDocsMenu(null);

    const handleFileInputChange = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        if (isReadOnly || isProcessing) return;
        const uploads = Array.from(files).map(file => uploadDocumentStub(file));
        try {
            const newDocs = await Promise.all(uploads);
            const prevSnapshot = {
                prevMeta: {...meta},
                prevDocs: [...documents],
                prevPrompts: [...prompts],
                prevResults: {...results}
            };
            const nextDocs = [...documents, ...newDocs];
            setDocuments(nextDocs);
            await persistMatrix(prevSnapshot, {documents: nextDocs});
        } catch {
            alert('Failed to upload documents');
        } finally {
            // reset input so selecting the same file again will trigger change
            e.target.value = '';
        }
    };

    const requestDeleteDoc = (id, name) => {
        if (isReadOnly || isProcessing) return;
        setDeleteModal({isOpen: true, type: 'DOC', targetId: id, name: name, title: 'Delete Document?'});
    };

    const requestDeleteColumn = (id, name) => {
        if (isReadOnly || isProcessing) return;
        setDeleteModal({isOpen: true, type: 'COL', targetId: id, name: name, title: 'Delete Column?'});
    };

    const executeDelete = async () => {
        const {type, targetId} = deleteModal;
        const prevSnapshot = {
            prevMeta: {...meta},
            prevDocs: [...documents],
            prevPrompts: [...prompts],
            prevResults: {...results}
        };

        if (type === 'DOC') {
            const nextDocs = documents.filter(d => d.id !== targetId);
            setDocuments(nextDocs);
            setResults(prev => {
                const next = {...prev};
                Object.keys(next).forEach(key => {
                    if (key.startsWith(targetId)) delete next[key];
                });
                return next;
            });
        } else if (type === 'COL') {
            const nextPrompts = prompts.filter(p => p.id !== targetId);
            setPrompts(nextPrompts);
            setEditingCol(null);
            setResults(prev => {
                const next = {...prev};
                Object.keys(next).forEach(k => {
                    if (k.endsWith(`_${targetId}`)) delete next[k];
                });
                return next;
            });
        } else if (type === 'CLEAR_ALL') {
            const nextDocs = [];
            setDocuments(nextDocs);
            setResults({});
        }

        // Build overrides reflecting the change we just applied
        let overrides = {};
        if (type === 'DOC') {
            overrides = {documents: documents.filter(d => d.id !== targetId)};
        } else if (type === 'COL') {
            overrides = {prompts: prompts.filter(p => p.id !== targetId)};
        } else if (type === 'CLEAR_ALL') {
            overrides = {documents: []};
        }

        const ok = await persistMatrix(prevSnapshot, overrides);
        if (!ok) {
            // rollback already handled
        }

        setDeleteModal({isOpen: false, type: 'DOC', targetId: null, name: ''});
    };

    // endregion

    // region --- Actions: Column Management ---

    const addColumn = async () => {
        if (isProcessing || isReadOnly) return;
        const prevSnapshot = {
            prevMeta: {...meta},
            prevDocs: [...documents],
            prevPrompts: [...prompts],
            prevResults: {...results}
        };
        const newCol = {id: generateUUID(), header: 'New Column', promptText: ''};
        const nextPrompts = [...prompts, newCol];
        setPrompts(nextPrompts);
        const ok = await persistMatrix(prevSnapshot, {prompts: nextPrompts});
        if (!ok) {
            // rollback handled in persistMatrix
        }
    };

    const openColumnEditor = (e, col) => {
        if (isProcessing || isReadOnly) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setEditingCol({
            id: col.id,
            header: col.header,
            promptText: col.promptText,
            top: rect.bottom,
            left: rect.left
        });
    };

    const saveColumnUpdate = async (id, newHeader, newPrompt) => {
        const prevSnapshot = {
            prevMeta: {...meta},
            prevDocs: [...documents],
            prevPrompts: [...prompts],
            prevResults: {...results}
        };
        const nextPrompts = prompts.map(p => p.id === id ? ({...p, header: newHeader, promptText: newPrompt}) : p);
        setPrompts(nextPrompts);
        const ok = await persistMatrix(prevSnapshot, {prompts: nextPrompts});
        if (!ok) return; // rollback if failed
        setEditingCol(null);
    };

    // endregion

    // region --- Column Drag & Drop Handlers ---

    const handleColumnDragStart = (e, id) => {
        if (isProcessing || isReadOnly) return;
        setDraggedColId(id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleColumnDragOver = (e) => {
        e.preventDefault();
    };

    const handleColumnDrop = async (e, targetId) => {
        e.preventDefault();
        if (!draggedColId || draggedColId === targetId) return;

        // Extra safety
        if (isReadOnly || isProcessing) return;

        const oldIndex = prompts.findIndex(p => p.id === draggedColId);
        const newIndex = prompts.findIndex(p => p.id === targetId);

        if (oldIndex !== -1 && newIndex !== -1) {
            const prevSnapshot = {
                prevMeta: {...meta},
                prevDocs: [...documents],
                prevPrompts: [...prompts],
                prevResults: {...results}
            };
            const newPrompts = [...prompts];
            const [movedItem] = newPrompts.splice(oldIndex, 1);
            newPrompts.splice(newIndex, 0, movedItem);
            setPrompts(newPrompts);
            await persistMatrix(prevSnapshot, {prompts: newPrompts});
        }
        setDraggedColId(null);
    };
    // endregion

    // region --- Simulation: Backend Processing & Polling ---

    const startProcessing = () => {
        if (isReadOnly) return;
        setIsProcessing(true);
        runAnalysis(meta.id, []);

        setResults(prev => {
            const next = {...prev};
            documents.forEach(doc => {
                prompts.forEach(p => {
                    const key = `${doc.id}_${p.id}`;
                    if (!next[key]) {
                        next[key] = {status: 'pending', content: null};
                    }
                });
            });
            return next;
        });
    };

    // The "Poller"
    const resultsRef = useRef(results);
    useEffect(() => {
        resultsRef.current = results;
    }, [results]);

    useEffect(() => {
        let interval;
        if (isProcessing) {
            interval = setInterval(async () => {
                const currentResults = resultsRef.current;
                const pendingKeys = Object.keys(currentResults).filter(k =>
                    currentResults[k].status === 'pending' || currentResults[k].status === 'processing'
                );

                if (pendingKeys.length === 0) {
                    if (documents.length > 0) {
                        setIsProcessing(false);
                    }
                    return;
                }

                try {
                    const updates = await checkBatchStatusStub(meta.id, pendingKeys);
                    if (Object.keys(updates).length > 0) {
                        setResults(prev => ({...prev, ...updates}));
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 2000);
        }
        return () => clearInterval(interval);
    }, [isProcessing, documents.length, meta.id]);

    // endregion

    // region --- Render Helpers ---

    const getCellStatus = (docId, promptId) => {
        const key = `${docId}_${promptId}`;
        return results[key] || {status: 'idle', content: null};
    };

    const exportToCSV = () => {
        if (documents.length === 0) {
            alert("No data to export.");
            return;
        }
        // // 'Document ID', 'File Size',
        const headers = ['Document Name', ...prompts.map(p => p.header)];
        const rows = documents.map(doc => {
            return [
                doc.name, // doc.id, doc.size,
                ...prompts.map(p => {
                    const cell = getCellStatus(doc.id, p.id);
                    if (cell.status === 'completed') return cell.content;
                    if (cell.status === 'processing') return '[Processing]';
                    if (cell.status === 'pending') return '[Pending]';
                    if (cell.status === 'error') return cell.error; // TODO: decide on error handling
                    return '';
                })
            ];
        });
        const csvContent = [headers, ...rows].map(e => e.map(item => {
            const str = String(item || '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(',')).join('\n');
        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        // _${new Date().toISOString().slice(0, 10)}
        link.setAttribute('download', `${meta.name.replace(/\s+/g, '_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    // endregion

    // region UI CODE (return statement)
    // class for toolbar group read-only mode disables all buttons and grays it out...
    // ${isReadOnly ? 'opacity-50 pointer-events-none grayscale' : ''}
    return (
        <div
            className="h-full max-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 flex flex-col overflow-x-hidden overflow-y-hidden min-w-0">

            {/* Top Navigation / Controls */}
            <header className="bg-white border-b border-slate-200 sticky top-0 shadow-sm">
                <div className="max-w-[1800px] mx-auto px-4 py-2 flex justify-between items-center h-16">

                    {/* Left: Title & Meta */}
                    <div className="flex items-center gap-4">
                        <div
                            className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200 shrink-0">
                            <LazyLucideIcon iconName="Database" size={20}/>
                        </div>
                        <div className="min-w-0">
                            <input
                                type="text"
                                value={meta.name}
                                disabled={isReadOnly}
                                onChange={(e) => setMeta({...meta, name: e.target.value})}
                                className={`text-lg font-bold tracking-tight text-slate-800 bg-transparent border-none focus:ring-0 p-0 w-full truncate ${isReadOnly ? 'cursor-default opacity-80' : 'hover:underline decoration-dashed decoration-slate-300 underline-offset-4 cursor-text'}`}
                            />
                            <div
                                className="flex items-center gap-2 text-xs text-slate-500 font-medium whitespace-nowrap">
                                <span>Workspace:&nbsp;{meta.workspace}</span>
                                <span className="text-slate-300">•</span>
                                <span className="flex items-center gap-1">
                                    {isSavingUI ? (
                                        <span className="text-indigo-600 animate-pulse">Saving…</span>
                                    ) : (
                                        <>
                                            <span>Updated:&nbsp;{meta.lastUpdated.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
                                            {!isReadOnly && (
                                                <LazyLucideIcon iconName="Save" size={10} className="text-slate-400"/>
                                            )}
                                        </>
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Actions Toolbar */}
                    <div className="flex items-center gap-2">

                        {/* --- LOCK ICON --- */}
                        <div className="flex items-center border-r border-slate-200 pr-3 mr-1">
                            <button
                                onClick={handleLockClick}
                                className={`
                  p-2 rounded-full transition-all flex items-center gap-2 text-sm font-semibold
                  ${isReadOnly
                                    ? 'bg-red-50 text-red-600 border border-red-100'
                                    : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}
                  ${permissions.canManageLock ? 'hover:scale-105 active:scale-95 cursor-pointer shadow-sm' : 'cursor-default opacity-75'}
                `}
                                title={permissions.canManageLock
                                    ? (isReadOnly ? "Click to Unlock Matrix" : "Click to Lock Matrix (Read-Only)")
                                    : (isReadOnly ? "Matrix is Read-Only" : "Matrix is Editable")}
                            >
                                {isReadOnly ? <LazyLucideIcon iconName="Lock" size={16} fill="currentColor"/> :
                                    <LazyLucideIcon iconName="LockOpen" size={16}/>}
                                <span className="hidden sm:inline">{isReadOnly ? 'Read-Only' : 'Editable'}</span>
                            </button>
                        </div>

                        <div
                            className={`flex items-center bg-slate-100 rounded-lg p-1 mr-2 border border-slate-200`}>
                            <button onClick={handleNew}
                                    className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-md transition-all"
                                    title="New Matrix">
                                <LazyLucideIcon iconName="FilePlus" size={18}/>
                            </button>
                            <button onClick={() => setBrowserModal({isOpen: true, mode: 'OPEN'})}
                                    className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-md transition-all"
                                    title="Open Matrix">
                                <LazyLucideIcon iconName="FolderOpen" size={18}/>
                            </button>
                            <button onClick={handleDuplicate}
                                    className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-md transition-all"
                                    title="Duplicate Matrix">
                                <LazyLucideIcon iconName="Copy" size={18}/>
                            </button>
                        </div>

                        <div className="h-8 w-px bg-slate-200 mx-1"></div>

                        <button
                            onClick={() => setBrowserModal({isOpen: true, mode: 'IMPORT'})}
                            disabled={isReadOnly || isProcessing}
                            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Import Columns from other Matrix"
                        >
                            <LazyLucideIcon iconName="ArrowDownToLine" size={16}/>
                            <span className="hidden xl:inline">Import Cols</span>
                        </button>

                        <button
                            onClick={handleClearDocs}
                            disabled={isReadOnly || isProcessing}
                            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Clear all documents"
                        >
                            <LazyLucideIcon iconName="Trash2" size={16}/>
                        </button>

                        <button
                            onClick={exportToCSV}
                            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            <LazyLucideIcon iconName="Download" size={16}/>
                            <span className="hidden lg:inline">Export</span>
                        </button>

                        {/* Transpose Toggle */}
                        <button
                            onClick={() => setIsTransposed(prev => !prev)}
                            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${isTransposed ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                            title={isTransposed ? 'Show: Documents as rows, Prompts as columns' : 'Show: Documents as columns, Prompts as rows'}
                        >
                            <LazyLucideIcon iconName="FlipHorizontal" size={16}/>
                            <span className="hidden xl:inline">{isTransposed ? 'Normal View' : 'Transpose'}</span>
                        </button>

                        <button
                            onClick={startProcessing}
                            disabled={isProcessing || isReadOnly || documents.length === 0}
                            className={`
                flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg shadow-md transition-all ml-2
                ${isProcessing || isReadOnly
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 shadow-none'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-200 hover:-translate-y-0.5 active:translate-y-0'}
              `}
                        >
                            {isProcessing ? (
                                <><LazyLucideIcon iconName="Loader2" className="animate-spin" size={16}/> Run</>
                            ) : (
                                <><LazyLucideIcon iconName="Play" size={16} fill="currentColor"/> Run</>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main
                className="p-6 max-w-[1800px] mx-auto w-full flex-1 flex flex-col relative min-w-0 min-h-0 overflow-hidden">

                {/* Read Only Watermark / Overlay (Optional visual cue) */}
                {/*{isReadOnly && (*/}
                {/*    <div className="absolute top-0 right-0 p-4 pointer-events-none z-0 opacity-5">*/}
                {/*        <LazyLucideIcon iconName="Shield" size={400}/>*/}
                {/*    </div>*/}
                {/*)}*/}

                {/* State Banner (if running) */}
                {isProcessing && (
                    <div
                        className="mb-6 bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center justify-between animate-in slide-in-from-top-2 relative z-10">
                        <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
                            <p className="text-sm text-blue-800 font-medium">
                                The batch engine is currently processing individual cells.&nbsp;<span
                                className="opacity-70">UI is locked.</span>
                            </p>
                        </div>
                        <LazyLucideIcon iconName="Lock" size={16} className="text-blue-400"/>
                    </div>
                )}

                {/* Read Only Banner (if locked) */}
                {isReadOnly && !isProcessing && (
                    <div
                        className="mb-6 bg-red-50 border border-red-100 rounded-lg p-3 flex items-center justify-between animate-in slide-in-from-top-2 relative z-10">
                        <div className="flex items-center gap-3">
                            <LazyLucideIcon iconName="ShieldAlert" size={18} className="text-red-500"/>
                            <p className="text-sm text-red-800 font-medium">
                                This matrix is in &nbsp;<span className="font-bold">Read-Only Mode</span>.&nbsp; Edits
                                are disabled.
                            </p>
                        </div>
                    </div>
                )}

                <div
                    className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1 relative z-10 min-w-0 min-h-0 ${isReadOnly ? 'bg-slate-50/30' : ''}`}>

                    {/* Scrollable Table Container */}
                    <div className="overflow-x-auto overflow-y-auto min-w-0 min-h-0 flex-1">
                        {/* Use w-max so the table can grow beyond the viewport width and enable horizontal scrolling */}
                        <table className="w-max min-w-full text-left border-collapse">
                            {isTransposed ? (
                                <>
                                    <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        {/* Fixed Header: Prompts/Questions */}
                                        <th className="sticky left-0 z-10 bg-slate-50 p-4 min-w-[250px] w-[250px] border-r border-slate-200 font-semibold text-slate-600 text-sm">
                                            Prompts/Questions ({prompts.length})
                                        </th>

                                        {/* Dynamic Document Headers (as Columns) */}
                                        {documents.map((doc) => (
                                            <th key={doc.id}
                                                className="p-4 min-w-[300px] border-r border-slate-100 text-slate-600 text-sm relative">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                                        <LazyLucideIcon iconName="FileText" size={16}/>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div
                                                            className="text-sm font-medium text-slate-800 truncate max-w-[220px]"
                                                            title={doc.name}>
                                                            {doc.name}
                                                        </div>
                                                        <div
                                                            className="text-xs text-slate-400 font-mono">{doc.id.substring(0, 8)}...
                                                        </div>
                                                    </div>
                                                    {!isProcessing && !isReadOnly && (
                                                        <button
                                                            onClick={() => requestDeleteDoc(doc.id, doc.name)}
                                                            className="ml-auto text-slate-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                                                        >
                                                            <LazyLucideIcon iconName="Trash2" size={16}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </th>
                                        ))}

                                        {/* Add Document Button Header */}
                                        <th className="p-4 min-w-[100px]">
                                            <button
                                                onClick={openAddDocsMenu}
                                                disabled={isProcessing || isReadOnly}
                                                className="w-full h-full min-h-[40px] border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <LazyLucideIcon iconName="Plus" size={20}/>
                                            </button>
                                        </th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {/* Add Documents Drop Zone (Spanning all columns) */}
                                    {!isProcessing && !isReadOnly && (
                                        <tr
                                            onDragEnter={handleDrag}
                                            onDragLeave={handleDrag}
                                            onDragOver={handleDrag}
                                            onDrop={handleDrop}
                                        >
                                            <td colSpan={documents.length + 2} className="px-4 pt-2 pb-0">
                                                <div
                                                    onClick={openAddDocsMenu}
                                                    className={`
                                                      inline-flex items-center gap-2 px-3 h-10 rounded-md border-2 border-dashed cursor-pointer select-none text-slate-500 text-sm
                                                      ${dragActive ? 'border-indigo-500 bg-indigo-50/60 text-indigo-700' : 'border-slate-300 hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-600'}
                                                    `}
                                                    title="Click to add documents, or drag & drop files here"
                                                >
                                                    <LazyLucideIcon iconName="Plus" size={18}/>
                                                    <span className="font-medium">Add documents</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}

                                    {/* Data Rows (Prompts) */}
                                    {prompts.map((col) => (
                                        <tr key={col.id}
                                            className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                                            {/* Prompt Header Cell (First Column) - Draggable & Editable */}
                                            <td
                                                className={`sticky left-0 bg-white group-hover:bg-slate-50/50 p-4 border-r border-slate-200 z-10 align-top
                                                    ${draggedColId === col.id ? 'opacity-40 bg-slate-200' : ''}
                                                    ${!isProcessing && !isReadOnly ? 'cursor-grab active:cursor-grabbing' : ''}
                                                `}
                                                draggable={!isProcessing && !isReadOnly}
                                                onDragStart={(e) => handleColumnDragStart(e, col.id)}
                                                onDragOver={handleColumnDragOver}
                                                onDrop={(e) => handleColumnDrop(e, col.id)}
                                                onDoubleClick={(e) => openColumnEditor(e, col)}
                                            >
                                                <div className="relative">
                                                    {/* Hover Hint */}
                                                    {!isProcessing && !isReadOnly && (
                                                        <div
                                                            className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                                            <span
                                                                className="text-[10px] bg-slate-800 text-white px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                                                Double-click to edit • Drag to reorder
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-2 mb-1">
                                                         <span
                                                             className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${isReadOnly ? 'bg-slate-200 text-slate-500' : 'bg-indigo-50 text-indigo-700'}`}>
                                                            Prompt
                                                         </span>
                                                        <span
                                                            className="font-semibold truncate max-w-[180px]">{col.header}</span>
                                                    </div>
                                                    <div
                                                        className="text-xs text-slate-400 font-normal mt-1 truncate max-w-[250px]">
                                                        "{col.promptText}"
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Data Cells (Documents) */}
                                            {documents.map((doc) => {
                                                const cellData = getCellStatus(doc.id, col.id);

                                                return (
                                                    <td key={`${doc.id}_${col.id}`}
                                                        className="p-4 align-top border-r border-slate-100 last:border-0 relative h-full">
                                                        <div
                                                            onClick={(e) => {
                                                                if (cellData.status === 'completed') {
                                                                    handleCellClick(e, doc.id, col.id, cellData.content);
                                                                }
                                                            }}
                                                            className={`
                                                               h-full min-h-[60px] text-sm rounded-md transition-all
                                                               ${cellData.status === 'idle' ? 'text-slate-400 italic flex items-center' : ''}
                                                               ${cellData.status === 'pending' ? 'bg-slate-50 animate-pulse' : ''}
                                                               ${cellData.status === 'processing' ? 'bg-indigo-50/30 border-l-2 border-indigo-400 pl-3' : ''}
                                                               ${cellData.status === 'completed' ? 'text-slate-700 hover:bg-indigo-50/40 cursor-pointer group/cell relative' : ''}
                                                             `}
                                                        >
                                                            {cellData.status === 'idle' && (
                                                                <span className="text-xs opacity-50">Waiting for start...</span>
                                                            )}

                                                            {cellData.status === 'pending' && (
                                                                <div className="flex items-center gap-2 h-full">
                                                                    <div
                                                                        className="w-2 h-2 bg-slate-300 rounded-full"></div>
                                                                    <span
                                                                        className="text-xs text-slate-400">Queued...</span>
                                                                </div>
                                                            )}

                                                            {cellData.status === 'processing' && (
                                                                <div className="flex flex-col gap-1 py-1">
                                                                    <div
                                                                        className="flex items-center gap-2 text-indigo-600">
                                                                        <LazyLucideIcon iconName="Loader2" size={14}
                                                                                        className="animate-spin"/>
                                                                        <span
                                                                            className="text-xs font-bold uppercase tracking-wider">Generating</span>
                                                                    </div>
                                                                    <div
                                                                        className="h-2 w-16 bg-indigo-100 rounded overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-indigo-400 animate-[progress_1s_ease-in-out_infinite] w-full origin-left"></div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {cellData.status === 'completed' && (
                                                                <div
                                                                    className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                                                                    <div
                                                                        className="flex items-center justify-between mb-1">
                                                                        <div
                                                                            className="flex items-center gap-2 text-emerald-600">
                                                                            <LazyLucideIcon iconName="Check" size={12}
                                                                                            strokeWidth={4}/>
                                                                            <span
                                                                                className="text-[10px] font-bold uppercase">Ready</span>
                                                                        </div>
                                                                        <LazyLucideIcon iconName="MoreHorizontal"
                                                                                        size={14}
                                                                                        className="text-slate-300 opacity-0 group-hover/cell:opacity-100"/>
                                                                    </div>
                                                                    <div className="leading-relaxed line-clamp-4">
                                                                        <SciMarkdown>{cellData.content}</SciMarkdown>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}

                                            {/* Spacer for Add Doc Column */}
                                            <td className="p-4 bg-slate-50/20"></td>
                                        </tr>
                                    ))}

                                    {/* Add Prompt Row */}
                                    <tr>
                                        <td className="p-4 sticky left-0 bg-white border-r border-slate-200 z-10">
                                            <button
                                                onClick={addColumn}
                                                disabled={isProcessing || isReadOnly}
                                                className="w-full min-h-[40px] border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <LazyLucideIcon iconName="Plus" size={20}/>
                                                <span className="ml-2 font-medium">Add Prompt</span>
                                            </button>
                                        </td>
                                        <td colSpan={documents.length + 1}></td>
                                    </tr>

                                    {documents.length === 0 && (
                                        <tr>
                                            <td colSpan={documents.length + 2} className="p-12 text-center">
                                                <div
                                                    className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4 text-slate-400">
                                                    <LazyLucideIcon iconName="Database" size={32}/>
                                                </div>
                                                <h3 className="text-slate-900 font-medium mb-1">Matrix is Empty</h3>
                                                <p className="text-slate-500 text-sm">Add data by dropping files or
                                                    select
                                                    "Add
                                                    documents" to add existing sources.</p>
                                            </td>
                                        </tr>
                                    )}
                                    </tbody>
                                </>
                            ) : (
                                <>
                                    <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        {/* Fixed ID/File Column Header */}
                                        <th className="sticky left-0 z-10 bg-slate-50 p-4 min-w-[250px] w-[250px] border-r border-slate-200 font-semibold text-slate-600 text-sm">
                                            Documents/Sources&nbsp;({documents.length})
                                        </th>

                                        {/* Dynamic Prompt Columns Headers */}
                                        {prompts.map((col) => (
                                            <th
                                                key={col.id}
                                                draggable={!isProcessing && !isReadOnly}
                                                onDragStart={(e) => handleColumnDragStart(e, col.id)}
                                                onDragOver={handleColumnDragOver}
                                                onDrop={(e) => handleColumnDrop(e, col.id)}
                                                onDoubleClick={(e) => openColumnEditor(e, col)}
                                                className={`
                        p-4 min-w-[300px] border-r border-slate-100 text-slate-600 text-sm
                        relative select-none transition-colors
                        ${isProcessing || isReadOnly ? 'cursor-default' : 'hover:bg-slate-100 group cursor-grab active:cursor-grabbing'}
                        ${draggedColId === col.id ? 'opacity-40 bg-slate-200' : ''}
                      `}
                                            >
                                                {/* Hover Hint */}
                                                {!isProcessing && !isReadOnly && (
                                                    <div
                                                        className="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                                <span
                                                    className="text-[10px] bg-slate-800 text-white px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                                    Double-click to edit • Drag to reorder
                                                </span>
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-2">
                                            <span
                                                className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${isReadOnly ? 'bg-slate-200 text-slate-500' : 'bg-indigo-50 text-indigo-700'}`}>
                                              {/*{!isReadOnly && <LazyLucideIcon iconName="GripHorizontal" size={10} className="opacity-50"/>}*/}
                                                Prompt
                                            </span>
                                                    <span
                                                        className="font-semibold truncate max-w-[180px]">{col.header}</span>
                                                </div>
                                                <div
                                                    className="text-xs text-slate-400 font-normal mt-1 truncate max-w-[250px]">
                                                    "{col.promptText}"
                                                </div>
                                            </th>
                                        ))}

                                        {/* Add Column Button Header */}
                                        <th className="p-4 min-w-[100px]">
                                            <button
                                                onClick={addColumn}
                                                disabled={isProcessing || isReadOnly}
                                                className="w-full h-full min-h-[40px] border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 disabled:hover:border-slate-300 disabled:cursor-not-allowed"
                                            >
                                                <LazyLucideIcon iconName="Plus" size={20}/>
                                            </button>
                                        </th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {/* Compact Add Documents Region (Drag & Drop + Click Menu) */}
                                    {!isProcessing && !isReadOnly && (
                                        <tr
                                            onDragEnter={handleDrag}
                                            onDragLeave={handleDrag}
                                            onDragOver={handleDrag}
                                            onDrop={handleDrop}
                                        >
                                            <td colSpan={prompts.length + 2} className="px-4 pt-2 pb-0">
                                                <div
                                                    onClick={openAddDocsMenu}
                                                    className={`
                          inline-flex items-center gap-2 px-3 h-10 rounded-md border-2 border-dashed cursor-pointer select-none text-slate-500 text-sm
                          ${dragActive ? 'border-indigo-500 bg-indigo-50/60 text-indigo-700' : 'border-slate-300 hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-600'}
                        `}
                                                    title="Click to add documents, or drag & drop files here"
                                                >
                                                    <LazyLucideIcon iconName="Plus" size={18}/>
                                                    <span className="font-medium">Add documents</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}

                                    {/* Data Rows */}
                                    {documents.map((doc) => (
                                        <tr key={doc.id}
                                            className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                                            {/* File Info Cell */}
                                            <td className="sticky left-0 bg-white group-hover:bg-slate-50/50 p-4 border-r border-slate-200 z-10 align-top">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                        <div
                                                            className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                                            <LazyLucideIcon iconName="FileText" size={16}/>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div
                                                                className="text-sm font-medium text-slate-800 truncate max-w-[140px]"
                                                                title={doc.name}>{doc.name}</div>
                                                            <div
                                                                className="text-xs text-slate-400 font-mono">{doc.id.substring(0, 8)}...
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {!isProcessing && !isReadOnly && (
                                                        <button
                                                            onClick={() => requestDeleteDoc(doc.id, doc.name)}
                                                            className="text-slate-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <LazyLucideIcon iconName="Trash2" size={16}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Result Cells */}
                                            {prompts.map((col) => {
                                                const cellData = getCellStatus(doc.id, col.id);

                                                return (
                                                    <td key={`${doc.id}_${col.id}`}
                                                        className="p-4 align-top border-r border-slate-100 last:border-0 relative h-full">
                                                        <div
                                                            onClick={(e) => {
                                                                if (cellData.status === 'completed') {
                                                                    handleCellClick(e, doc.id, col.id, cellData.content);
                                                                }
                                                            }}
                                                            className={`
                               h-full min-h-[60px] text-sm rounded-md transition-all
                               ${cellData.status === 'idle' ? 'text-slate-400 italic flex items-center' : ''}
                               ${cellData.status === 'pending' ? 'bg-slate-50 animate-pulse' : ''}
                               ${cellData.status === 'processing' ? 'bg-indigo-50/30 border-l-2 border-indigo-400 pl-3' : ''}
                               ${cellData.status === 'completed' ? 'text-slate-700 hover:bg-indigo-50/40 cursor-pointer group/cell relative' : ''}
                             `}
                                                        >
                                                            {cellData.status === 'idle' && (
                                                                <span className="text-xs opacity-50">Waiting for start...</span>
                                                            )}

                                                            {cellData.status === 'pending' && (
                                                                <div className="flex items-center gap-2 h-full">
                                                                    <div
                                                                        className="w-2 h-2 bg-slate-300 rounded-full"></div>
                                                                    <span
                                                                        className="text-xs text-slate-400">Queued...</span>
                                                                </div>
                                                            )}

                                                            {cellData.status === 'processing' && (
                                                                <div className="flex flex-col gap-1 py-1">
                                                                    <div
                                                                        className="flex items-center gap-2 text-indigo-600">
                                                                        <LazyLucideIcon iconName="Loader2" size={14}
                                                                                        className="animate-spin"/>
                                                                        <span
                                                                            className="text-xs font-bold uppercase tracking-wider">Generating</span>
                                                                    </div>
                                                                    <div
                                                                        className="h-2 w-16 bg-indigo-100 rounded overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-indigo-400 animate-[progress_1s_ease-in-out_infinite] w-full origin-left"></div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {cellData.status === 'completed' && (
                                                                <div
                                                                    className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                                                                    <div
                                                                        className="flex items-center justify-between mb-1">
                                                                        <div
                                                                            className="flex items-center gap-2 text-emerald-600">
                                                                            <LazyLucideIcon iconName="Check" size={12}
                                                                                            strokeWidth={4}/>
                                                                            <span
                                                                                className="text-[10px] font-bold uppercase">Ready</span>
                                                                        </div>
                                                                        <LazyLucideIcon iconName="MoreHorizontal"
                                                                                        size={14}
                                                                                        className="text-slate-300 opacity-0 group-hover/cell:opacity-100"/>
                                                                    </div>
                                                                    <div className="leading-relaxed line-clamp-4">
                                                                        <SciMarkdown>{cellData.content}</SciMarkdown>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}

                                            {/* Empty cell for "Add Column" alignment */}
                                            <td className="p-4 bg-slate-50/30"></td>
                                        </tr>
                                    ))}

                                    {documents.length === 0 && (
                                        <tr>
                                            <td colSpan={prompts.length + 2} className="p-12 text-center">
                                                <div
                                                    className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4 text-slate-400">
                                                    <LazyLucideIcon iconName="Database" size={32}/>
                                                </div>
                                                <h3 className="text-slate-900 font-medium mb-1">Matrix is Empty</h3>
                                                <p className="text-slate-500 text-sm">Add data by dropping files or
                                                    select
                                                    "Add
                                                    documents" to add existing sources.</p>
                                            </td>
                                        </tr>
                                    )}
                                    </tbody>
                                </>
                            )}
                        </table>
                    </div>
                </div>
            </main>

            {/* Floating Elements (Modals, Popovers) */}

            {editingCol && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setEditingCol(null)}></div>
                    <ColumnEditor
                        column={editingCol}
                        position={editingCol}
                        onSave={saveColumnUpdate}
                        onDelete={requestDeleteColumn}
                        onCancel={() => setEditingCol(null)}
                    />
                </>
            )}

            {/* Cell Action Menu */}
            {activeCellMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setActiveCellMenu(null)}></div>
                    <CellActionMenu
                        position={activeCellMenu}
                        content={activeCellMenu.content}
                        onCopy={handleCopyCell}
                        onDiscuss={handleDiscussCell}
                        onClose={() => setActiveCellMenu(null)}
                    />
                </>
            )}

            {/* Add Documents Menu */}
            {addDocsMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={closeAddDocsMenu}></div>
                    <div
                        className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 w-56 py-1 animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
                        style={{top: addDocsMenu.top, left: addDocsMenu.left}}
                    >
                        {selectExistingDataStub && (
                            <button
                                onClick={() => {
                                    closeAddDocsMenu();
                                    openDocPicker();
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                            >
                                <LazyLucideIcon iconName="Database" size={16} className="text-slate-400"/>
                                Select Existing Data
                            </button>
                        )}
                        {addSourceStub && (
                            <button
                                onClick={() => {
                                    addSourceStub();
                                    closeAddDocsMenu();
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors border-t border-slate-100"
                            >
                                <LazyLucideIcon iconName="Plug" size={16} className="text-slate-400"/>
                                Add Source
                            </button>
                        )}
                        {uploadDocumentStub && (
                            <button
                                onClick={triggerFileDialog}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors border-t border-slate-100"
                            >
                                <LazyLucideIcon iconName="Upload" size={16} className="text-slate-400"/>
                                Upload File
                            </button>
                        )}
                    </div>
                </>
            )}

            {/* Document Picker Modal (workspace files) */}
            {docPickerModal.isOpen && (
                <>
                    <div className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm"
                         onClick={() => setDocPickerModal(prev => ({...prev, isOpen: false}))}/>
                    <div
                        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[560px] max-h-[70vh] border border-slate-200 dark:border-slate-700 flex flex-col">
                        <div
                            className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Add
                                Document</h3>
                            <button
                                onClick={() => setDocPickerModal(prev => ({...prev, isOpen: false}))}
                                className="text-slate-400 hover:text-slate-600 transition-colors">
                                <LazyLucideIcon iconName="X" className="w-5 h-5"/>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {docPickerModal.loading ? (
                                <div className="flex items-center justify-center py-8 text-slate-400">
                                    <LazyLucideIcon iconName="Loader2" className="w-5 h-5 animate-spin mr-2"/>
                                    Loading workspace files...
                                </div>
                            ) : docPickerModal.files.length === 0 ? (
                                <div
                                    className="flex flex-col items-center justify-center py-8 text-slate-500 space-y-2">
                                    <LazyLucideIcon iconName="FileX" className="w-10 h-10 text-slate-300"/>
                                    <p className="text-sm">No files found in this workspace.</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {docPickerModal.files.map((f, i) => {
                                        const isAlreadyAdded = documents.some(d => d.id === (f.doc_id || f.name));
                                        return (
                                            <button
                                                key={f.doc_id || i}
                                                onClick={() => !isAlreadyAdded && handleDocPickerSelect(f)}
                                                disabled={isAlreadyAdded}
                                                className={`w-full flex items-center gap-3 p-2.5 text-left rounded-lg border transition-colors ${isAlreadyAdded ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'}`}
                                            >
                                                <LazyLucideIcon iconName="FileText"
                                                                className="w-4 h-4 text-slate-400 flex-shrink-0"/>
                                                <div className="flex-1 min-w-0">
                                                    <div
                                                        className="text-sm font-medium text-slate-800 truncate">{f.name || f.path}</div>
                                                    {f.size != null && (
                                                        <div className="text-xs text-slate-400">
                                                            {f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1048576).toFixed(1)} MB`}
                                                        </div>
                                                    )}
                                                </div>
                                                {isAlreadyAdded &&
                                                    <span className="text-xs text-slate-400 shrink-0">Added</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Hidden File Input for Upload */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
            />

            {/* Delete Confirmation Modal (Using generic ConfirmationModal) */}
            <ConfirmationModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({...deleteModal, isOpen: false})}
                onConfirm={executeDelete}
                title={deleteModal.title || "Confirm Deletion"}
                message={
                    deleteModal.type === 'CLEAR_ALL'
                        ? "Are you sure you want to clear all documents? This cannot be undone."
                        : `Are you sure you want to remove "${deleteModal.name}"? This action cannot be undone.`
                }
                confirmText="Delete"
                confirmStyle="danger"
            />

            <ConfirmationModal
                isOpen={lockConfirmModal.isOpen}
                onClose={() => setLockConfirmModal({...lockConfirmModal, isOpen: false})}
                onConfirm={confirmLockToggle}
                title={lockConfirmModal.action === 'LOCK' ? 'Enable Read-Only Mode?' : 'Disable Read-Only Mode?'}
                message={lockConfirmModal.action === 'LOCK'
                    ? "This will prevent any further edits to documents or columns until unlocked. This is useful for preventing accidental changes."
                    : "This will enable editing on this matrix. Ensure you have permission to modify this dataset."}
                confirmText={lockConfirmModal.action === 'LOCK' ? 'Lock Matrix' : 'Unlock Matrix'}
                confirmStyle={lockConfirmModal.action === 'LOCK' ? 'danger' : 'safe'}
            />

            <GenericLoadDialog
                isOpen={browserModal.isOpen}
                onClose={() => setBrowserModal({...browserModal, isOpen: false})}
                title={browserModal.mode === 'OPEN' ? 'Open Matrix' : 'Select Source Matrix'}
                listWorkspaces={listWorkspacesForDialog}
                listItemsInWorkspace={listMatricesForDialog}
                initialWorkspaceId={workspace}
                onSelect={(item, wsId) => handleBrowserSelect(item, wsId)}
                emptyText="No matrices in this workspace"
            />

            <ColumnImportSelector
                isOpen={importColModal.isOpen}
                sourceMatrix={importColModal.sourceMatrix}
                onClose={() => setImportColModal({...importColModal, isOpen: false})}
                onImport={handleImportColumns}
                loadMatrix={loadMatrix}
                workspace={workspace}
            />

            {/* Revision Conflict Modal - forces reload */}
            <ConfirmationModal
                isOpen={revisionConflictModal.isOpen}
                onClose={() => setRevisionConflictModal(prev => ({...prev, isOpen: true}))}
                onConfirm={reloadFromServer}
                title={"Reload Required"}
                message={revisionConflictModal.message || 'A newer version of this matrix exists on the server. You must reload to continue.'}
                confirmText="Reload"
                confirmStyle="danger"
            />

        </div>
    );
    // endregion
}