// DEMO NOTE: DatasetManager RPCs are stubbed/mock and not wired to a real backend.
// This component is registered in DynamicJSXRenderer's components map so backend-sent
// JSX can instantiate it, but it is NOT reachable via normal UI navigation (no app
// launcher or sidebar entry). Do NOT surface this component to users until the RPC
// layer is fully implemented.
//
// help me make a jsx application component for managing datasets. Each user will be working within a workspace. (The component is initialized within the workspace, so the component will be initialized with workspace as a param/input).
//
// The user should be able to Create/Open/Duplicate/Save As/Delete datasets. Each dataset is an arbitrary combination of data from potentially multiple sources.
//
// We already have an existing "file browser" type component to be able to find files from multiple "data providers";
// "LibraryFileBrowser.jsx"
//
// A dataset should enable users to add:
// - existing files via LibraryFileBrowser (same workspace)
// - glob syntax to find files (to support e.g. using a folder structure for each dataset and then automatically including new files later as long as they are in the correct folder) -- which should use LibraryFileBrowser to preview current results? (same workspace)
// - internal sources (potentially pull from a dataset in another workspace that the user has permissions for... we won't directly allow pulling files/folders from other workspaces, but we will indirectly allow it via datasets)
// - web sources (one or more URLs for external sources that should be considered part of this dataset)

// The goal for the component is basically to be a "standalone" interface to allow the user to manage datasets. Ideally, it would also have a preview pane (to the right) to check on specific sources.
// The preview pane would also allow adding annotations and comments to specific sources within the dataset to further
// enrich how the data will be used / interpreted later on.
// for document sources, we can show an image based preview per page (ingestion process already creates page images for PDFs and office documents). We should also have a page transcript, so we can have that as an alternate if available (page transcription takes longer than page images).
// for image type documents, we can just show the image preview and basic metadata (dimensions, format, etc). use "DocumentImageViewer.jsx" for rendering document image previews.
// for web sources, we can show text preview (or allow user to navigate to URL via iframe?)
// for tabular data sources (e.g. csv, xlsx), we can show a tabular preview of the data (first N rows). use "Spreadsheet.jsx" for rendering the tabular data preview.

// The dataset manager should also allow saving/loading datasets to/from the backend (we have existing RPC calls for this, so just need to integrate them into the UI).
//
// The component should be built with reusability in mind, so it can be easily integrated into different parts of the application in the future.
//
// Please provide the complete JSX code for this DatasetManager component.

// note that any RPC calls or backend integration can be stubbed out for now, with comments indicating where they would go.
// (but do ensure that there is a suitable placeholder for all necessary functionality).
// Use existing components where applicable (e.g. LibraryFileBrowser for file selection, DocumentImageViewer for document previews, Spreadsheet for tabular data previews).

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
    Plus,
    FolderOpen,
    Trash2,
    Sigma,
    CheckCircle2,
    Clock,
    Database,
    AlertCircle
} from 'lucide-react';
import FileBrowser from '../LibraryFileBrowser.jsx';
import RefreshButton from '../../UI/RefreshButton.jsx';
import {DEBUG_MODE} from "../../../constants/AppConstants";
import DatasetSourcesList from './DatasetSourcesList.jsx';
import DatasetSourcePreview, {detectFileKind} from './DatasetSourcePreview.jsx';
import GenericLoadDialog from '../../Widgets/GenericLoadDialog.jsx';

// DatasetManager: standalone app-style component to create/open/edit datasets within a workspace.
// Notes:
// - Integrates with FileBrowser to add existing files; supports glob patterns, internal datasets, and web URLs.
// - Right-side preview pane renders a preview depending on source type (doc/image/table/web) using existing widgets.
// - Backend RPC calls are stubbed; see TODOs to wire actual endpoints. Demo component provides mock data.

const SOURCE_TYPES = {
    FILE: 'file',
    GLOB: 'glob',
    INTERNAL: 'internal', // dataset reference
    WEB: 'web'
};

const initialDataset = (workspaceId) => ({
    id: null,
    name: 'Untitled Dataset',
    workspaceId,
    sources: [], // array of { id, type, label, payload, meta }
    annotations: {}, // { [sourceId]: [{ id, text, createdAt, authorId }...] }
});

// Utility: crude type detection by extension
// moved to DatasetSourcePreview.jsx

export default function DatasetManager({
                                           workspaceId,
                                           // Optional providers for embedding or demos
                                           listDatasets, // async () => [{id,name,workspaceId,updatedAt}] (legacy)
                                           loadDataset, // async (id) => dataset
                                           saveDataset, // async (dataset, {asName?}) => {id,name}
                                           deleteDataset, // async (id) => void
                                           // Workspace-aware providers
                                           listAvailableWorkspaces, // async () => [{id,name}]
                                           listDatasetsInWorkspace, // async (workspaceId) => [{id,name,updatedAt}]
                                           // File browser demo data provider (flat list of items with { name, modified, size, provider, path, doc_id })
                                           fileBrowserData = null,
                                           // Glob pattern resolution
                                           resolveGlob, // async (pattern, workspaceId) => [{label, path, docId, provider}]
                                           // Optional: preview providers
                                           fetchDocPageUrls, // async (docId, pageNos[]) => [{pageNo, url}]
                                           fetchTableMeta,   // async (source) => { columns, totalRows }
                                           fetchTableRows,   // async (source, {offset,limit,sort}) => rows
                                       }) {
    // const {sendRpcRequest} = useWebSocket();

    // --- Local state ---
    const [datasets, setDatasets] = useState([]); // list in column 1
    const [workspaces, setWorkspaces] = useState([]);
    const [selectedWs, setSelectedWs] = useState(workspaceId || null);
    const [ds, setDs] = useState(() => initialDataset(workspaceId));
    const [selectedSourceId, setSelectedSourceId] = useState(null);
    // When a glob source is expanded and a child file is clicked, we keep the parent selected
    // but store the actual child file object here for previewing.
    const [selectedSubSource, setSelectedSubSource] = useState(null);
    const [showFileBrowser, setShowFileBrowser] = useState(false);
    const [globPattern, setGlobPattern] = useState('');
    const [showAddGlobModal, setShowAddGlobModal] = useState(false);
    const selectedTopLevelSource = useMemo(() => ds.sources.find(s => s.id === selectedSourceId) || null, [ds, selectedSourceId]);
    const selectedSource = selectedSubSource || selectedTopLevelSource;
    // Dialog/modals state
    const [showSaveAsModal, setShowSaveAsModal] = useState(false);
    const [saveAsName, setSaveAsName] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showSelectDatasetDialog, setShowSelectDatasetDialog] = useState(false);
    const [showAddWebModal, setShowAddWebModal] = useState(false);
    const [webUrl, setWebUrl] = useState('');
    // Autosave state
    const [savingState, setSavingState] = useState('idle'); // idle | saving | saved | error
    const saveTimerRef = React.useRef(null);
    const suppressSaveRef = React.useRef(true); // start suppressed; mount effect enables after hash init
    const lastSavedHashRef = React.useRef('');

    // --- RPC fallbacks ---
    // Integration note: When used within a JSX app context (backend-rendered), provide callbacks
    // that call rpcToolCall("datasets_list", {...}), rpcToolCall("datasets_load", {...}), etc.
    // The backend handlers are in BasicAppsUX: on_arg_datasets_list, on_arg_datasets_load, etc.
    const listWorkspacesRpc = useCallback(async () => {
        if (listAvailableWorkspaces) return listAvailableWorkspaces();
        // Fallback: only current workspace
        if (workspaceId) return [{id: workspaceId, name: 'Current Workspace'}];
        return [];
    }, [listAvailableWorkspaces, workspaceId]);

    const listDatasetsInWorkspaceRpc = useCallback(async (wsId) => {
        if (listDatasetsInWorkspace) return listDatasetsInWorkspace(wsId);
        // Legacy fallback: use listDatasets then filter by workspaceId if present
        if (listDatasets) {
            const all = await listDatasets();
            return (all || []).filter(d => !d.workspaceId || d.workspaceId === wsId);
        }
        // No callback provided - return empty list (caller should provide callbacks)
        DEBUG_MODE && console.warn('DatasetManager: listDatasetsInWorkspace callback not provided');
        return [];
    }, [listDatasetsInWorkspace, listDatasets]);

    const loadDatasetRpc = useCallback(async (id) => {
        if (loadDataset) return loadDataset(id);
        // No callback provided - return initial dataset
        DEBUG_MODE && console.warn('DatasetManager: loadDataset callback not provided');
        return initialDataset(workspaceId);
    }, [loadDataset, workspaceId]);

    const saveDatasetRpc = useCallback(async (dataset, opts = {}) => {
        if (saveDataset) return saveDataset(dataset, opts);
        // No callback provided - return mock result for demo mode
        DEBUG_MODE && console.warn('DatasetManager: saveDataset callback not provided');
        return {id: dataset.id ?? 'demo-' + Date.now(), name: opts.asName || dataset.name};
    }, [saveDataset]);

    const deleteDatasetRpc = useCallback(async (id) => {
        if (deleteDataset) return deleteDataset(id);
        // No callback provided
        DEBUG_MODE && console.warn('DatasetManager: deleteDataset callback not provided');
    }, [deleteDataset]);

    const resolveGlobRpc = useCallback(async (pattern) => {
        if (resolveGlob) return resolveGlob(pattern, selectedWs || workspaceId);
        // No callback provided - return empty list for demo mode
        DEBUG_MODE && console.warn('DatasetManager: resolveGlob callback not provided');
        return [];
    }, [resolveGlob, selectedWs, workspaceId]);

    // Load workspaces and initial dataset list
    useEffect(() => {
        let mounted = true;
        (async () => {
            const ws = await listWorkspacesRpc();
            if (!mounted) return;
            setWorkspaces(ws || []);
            const initialWs = selectedWs || ws?.[0]?.id || workspaceId || null;
            setSelectedWs(initialWs);
            const list = initialWs ? await listDatasetsInWorkspaceRpc(initialWs) : [];
            if (!mounted) return;
            setDatasets(list || []);
        })();
        return () => { mounted = false; };
    }, [listWorkspacesRpc, listDatasetsInWorkspaceRpc]);

    // Reload datasets when workspace changes
    useEffect(() => {
        let mounted = true;
        if (!selectedWs) return;
        listDatasetsInWorkspaceRpc(selectedWs)
            .then(list => mounted && setDatasets(list || []))
            .catch(() => mounted && setDatasets([]));
        return () => { mounted = false; };
    }, [selectedWs, listDatasetsInWorkspaceRpc]);

    // --- Handlers: Dataset toolbar ---
    const handleCreate = () => {
        suppressSaveRef.current = true;
        const blank = initialDataset(workspaceId);
        setDs(blank);
        lastSavedHashRef.current = datasetHash(blank);
        setSelectedSourceId(null);
        setSelectedSubSource(null);
        setTimeout(() => { suppressSaveRef.current = false; }, 0);
    };

    const flushPendingSave = useCallback(async () => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        if (savingState === 'saving') {
            // allow current save effect to finish — this is a best-effort noop here
        }
    }, [savingState]);

    const handleOpen = async (id) => {
        suppressSaveRef.current = true;
        await flushPendingSave();
        const loaded = await loadDatasetRpc(id);
        setDs(loaded);
        setSelectedSourceId(loaded?.sources?.[0]?.id ?? null);
        setSelectedSubSource(null);
        // re-enable autosave shortly after state applied
        setTimeout(() => {
            suppressSaveRef.current = false;
        }, 0);
    };

    const handleSaveAs = async () => {
        setSaveAsName(ds.name + ' (Copy)');
        setShowSaveAsModal(true);
    };

    const handleDelete = async () => {
        if (!ds?.id) return;
        setShowDeleteModal(true);
    };

    // --- Handlers: Sources ---
    const addFilesFromBrowser = (items) => {
        if (!items || items.length === 0) {
            return;
        }
        const newSources = items.map((it) => {
            DEBUG_MODE && console.log('Adding source from file browser:', it);
            return ({
                id: `${SOURCE_TYPES.FILE}:${it.doc_id || it.path}`,
                type: SOURCE_TYPES.FILE,
                label: it.name,
                payload: {
                    provider: it.provider,
                    path: it.path,
                    docId: it.doc_id || null,
                    kind: detectFileKind(it.name || it.path)
                },
                meta: {addedAt: Date.now()}
            });
        });
        setDs(prev => ({...prev, sources: [...prev.sources, ...newSources]}));
        setShowFileBrowser(false);
        if (newSources.length) {
            setSelectedSourceId(newSources[0].id);
            setSelectedSubSource(null);
        }
    };

    const addGlob = () => {
        if (!globPattern) return;
        const id = `${SOURCE_TYPES.GLOB}:${globPattern}:${Date.now()}`;
        setDs(prev => ({
            ...prev, sources: [...prev.sources, {
                id,
                type: SOURCE_TYPES.GLOB,
                label: globPattern,
                payload: {pattern: globPattern},
                meta: {addedAt: Date.now()}
            }]
        }));
        setGlobPattern('');
        setSelectedSourceId(id);
        setSelectedSubSource(null);
    };

    const addInternalDataset = () => {
        // Use GenericLoadDialog to pick a dataset from any accessible workspace
        setShowSelectDatasetDialog(true);
    };

    const addWebUrl = () => {
        setWebUrl('https://');
        setShowAddWebModal(true);
    };

    const confirmAddWebUrl = () => {
        const url = (webUrl || '').trim();
        if (!url) {
            setShowAddWebModal(false);
            return;
        }
        const id = `${SOURCE_TYPES.WEB}:${url}`;
        setDs(prev => ({
            ...prev, sources: [...prev.sources, {
                id,
                type: SOURCE_TYPES.WEB,
                label: url,
                payload: {url},
                meta: {addedAt: Date.now()}
            }]
        }));
        setSelectedSourceId(id);
        setSelectedSubSource(null);
        setShowAddWebModal(false);
    };

    const removeSource = (id) => {
        setDs(prev => ({...prev, sources: prev.sources.filter(s => s.id !== id)}));
        if (selectedSourceId === id) {
            setSelectedSourceId(null);
            setSelectedSubSource(null);
        }
    };

    // --- Autosave effect (debounced) ---
    // Hash function to avoid saving when nothing materially changed
    const datasetHash = useCallback((d) => {
        if (!d) return '';
        const annCount = d.annotations ? Object.keys(d.annotations).length : 0;
        return `${d.id || 'null'}|${d.name}|${d.sources?.length || 0}|${annCount}`;
    }, []);

    useEffect(() => {
        if (suppressSaveRef.current) return;
        const hash = datasetHash(ds);
        if (hash === lastSavedHashRef.current) return; // no material changes

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setSavingState('saving');
        saveTimerRef.current = setTimeout(async () => {
            try {
                const result = await saveDatasetRpc(ds);
                lastSavedHashRef.current = datasetHash({...ds, id: result.id, name: result.name});
                // Only update state if id or name changed (e.g., first time save assigns id)
                if (result.id !== ds.id || result.name !== ds.name) {
                    setDs(prev => ({...prev, id: result.id, name: result.name}));
                }
                const list = await listDatasetsInWorkspaceRpc(selectedWs || workspaceId);
                setDatasets(list || []);
                setSavingState('saved');
                setTimeout(() => setSavingState('idle'), 1000);
            } catch (e) {
                console.error('Autosave failed', e);
                setSavingState('error');
            }
        }, 600); // debounce interval

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [ds, datasetHash, saveDatasetRpc, listDatasetsInWorkspaceRpc, selectedWs, workspaceId]);

    // On mount set initial hash and enable autosave (suppressSaveRef starts true)
    useEffect(() => {
        lastSavedHashRef.current = datasetHash(ds);
        suppressSaveRef.current = false;
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- Render helpers ---
    const renderToolbar = () => (
        <div className="flex items-center justify-between py-3 px-6 border-b border-slate-200 bg-white shadow-sm relative">
            <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-600 rounded-lg text-white shadow-lg shadow-blue-200">
                    <Database className="w-5 h-5" />
                </div>
                <div className="text-lg font-bold text-slate-800 tracking-tight">Dataset Manager</div>
            </div>
            <div className="flex items-center space-x-4">
                <div className="hidden md:flex items-center gap-2">
                    <span className="text-xs text-slate-500">Workspace:</span>
                    <select
                        value={selectedWs || ''}
                        onChange={e => setSelectedWs(e.target.value)}
                        className="text-sm px-2 py-1 border rounded bg-white text-slate-700"
                    >
                        {workspaces.map(ws => (
                            <option key={ws.id} value={ws.id}>{ws.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center text-xs text-slate-500 font-medium">
                    {savingState === 'saving' && (<><Clock className="w-3.5 h-3.5 mr-1.5 text-amber-500"/>Saving changes...</>)}
                    {savingState === 'saved' && (<><CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600"/>All changes saved</>)}
                    {savingState === 'error' && (<span className="text-red-600 flex items-center"><AlertCircle className="w-3.5 h-3.5 mr-1.5"/>Save failed</span>)}
                </div>
                <div className="h-6 w-px bg-slate-200 mx-2" />
                <RefreshButton
                    onRefresh={async () => setDatasets(await listDatasetsInWorkspaceRpc(selectedWs || workspaceId))}
                    title="Refresh datasets"
                />
            </div>
        </div>
    );



    const renderDatasetsColumn = () => (
        <div className="w-72 border-r border-slate-200 bg-slate-50/30 flex flex-col min-h-0 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-white">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saved Datasets</div>
                <button
                    className="px-2 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center shadow-sm"
                    onClick={handleCreate} title="New Dataset">
                    <Plus className="w-3.5 h-3.5 mr-1"/>New
                </button>
            </div>
            <div className="flex-1 overflow-auto bg-white">
                {datasets?.length ? (
                    <ul className="divide-y divide-slate-50">
                        {datasets.map(d => (
                            <li key={d.id}
                                className={`px-4 py-3 text-sm cursor-pointer transition-all border-l-4 ${ds.id === d.id ? 'bg-blue-50 border-blue-600 text-blue-800' : 'border-transparent hover:bg-slate-50 text-slate-600 hover:text-slate-900'}`}
                                onClick={() => handleOpen(d.id)}
                            >
                                <div className="truncate font-medium" title={d.name}>{d.name}</div>
                                {ds.id === d.id && <div className="text-xs text-blue-400 mt-0.5">Active</div>}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="p-6 text-center text-sm text-slate-400 flex flex-col items-center">
                        <FolderOpen className="w-8 h-8 mb-2 opacity-20" />
                        No saved datasets in this workspace
                    </div>
                )}
            </div>
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
                <button
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 inline-flex items-center justify-center transition-colors shadow-sm"
                    onClick={handleSaveAs} title="Save As">
                    <Sigma className="w-3.5 h-3.5 mr-1.5"/>Save As
                </button>
                <button
                    className="px-3 py-2 text-xs font-medium rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 hover:border-red-300 inline-flex items-center justify-center transition-colors shadow-sm"
                    onClick={handleDelete} title="Delete">
                    <Trash2 className="w-3.5 h-3.5"/>
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-slate-50">
            {renderToolbar()}
            <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
                {renderDatasetsColumn()}
                <DatasetSourcesList
                    ds={ds}
                    setDs={setDs}
                    selectedSourceId={selectedSourceId}
                    setSelectedSourceId={setSelectedSourceId}
                    selectedSubSourceKey={selectedSubSource?.payload?.path || selectedSubSource?.payload?.docId || selectedSubSource?.label || null}
                    onSelectSubSource={(child, parent) => {
                        // parent remains selected for highlighting
                        setSelectedSourceId(parent.id);
                        setSelectedSubSource(child);
                    }}
                    onSelectTopLevel={(src) => {
                        setSelectedSubSource(null);
                        setSelectedSourceId(src?.id || null);
                    }}
                    readOnly={false}
                    onAddFiles={() => setShowFileBrowser(true)}
                    onAddGlob={() => setShowAddGlobModal(true)}
                    onAddInternal={addInternalDataset}
                    onAddWeb={addWebUrl}
                    onRemoveSource={removeSource}
                    onResolveGlob={resolveGlobRpc}
                />
                <div className="flex-1 h-full min-w-0 min-h-0 overflow-hidden bg-slate-50/50">
                    <DatasetSourcePreview
                        selectedSource={selectedSource}
                        fetchTableMeta={fetchTableMeta}
                        fetchTableRows={fetchTableRows}
                        fetchDocPageUrls={fetchDocPageUrls}
                    />
                </div>
                {/* Simple modal for FileBrowser selection */}
                {showFileBrowser && (
                    <div className="fixed inset-0 z-40">
                        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowFileBrowser(false)}/>
                        <div className="absolute inset-6 bg-white rounded-lg shadow-2xl flex flex-col border border-slate-200">
                            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                                <div className="font-bold text-slate-700">Add Files</div>
                                <button className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
                                        onClick={() => setShowFileBrowser(false)}>Close
                                </button>
                            </div>
                            <div className="flex-1 min-h-0">
                                {fileBrowserData ? (
                                    <FileBrowser
                                        data={fileBrowserData}
                                        workspaceId={workspaceId}
                                        onIngest={(selected) => addFilesFromBrowser(selected)}
                                        // canIngest={(selected) => selected.length > 0}
                                        onDelete={() => {
                                        }}
                                        onUploadCompletion={() => {
                                        }} // TODO: call to std jsx upload_complete
                                        // onSyncMetadata={() => {}}
                                        refreshFunction={() => {
                                        }} // TODO: implement refreshFunction
                                        showSelectedKeys={false}
                                        showDataSourceColumn={false}
                                        showBreadcrumbs={true}
                                        // initialPath={''}
                                        showReferenceInChat={false}
                                        // clearChatDocumentsOnReference={false}
                                        // customChatReferenceAction={({selectedItems}) => addFilesFromBrowser(selectedItems)}
                                        // chatReferenceText={"Add to Dataset"}
                                        ingestButtonTitle={"Add to Dataset"}
                                        ingestTakesObjects={true}
                                    />
                                ) : (
                                    <div className="p-8 text-center text-sm text-slate-500">
                                        Integrate FileBrowser here by providing 'fileBrowserData' or wiring RPC-backed
                                        provider.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {/* Save As Modal */}
                {showSaveAsModal && (
                    <div className="fixed inset-0 z-40">
                        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowSaveAsModal(false)}/>
                        <div
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[420px] border border-slate-200">
                            <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 bg-slate-50 rounded-t-lg">Save Dataset As</div>
                            <div className="p-4 space-y-2">
                                <div className="text-sm text-slate-600 font-medium">Name</div>
                                <input className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" value={saveAsName}
                                       onChange={e => setSaveAsName(e.target.value)}/>
                            </div>
                            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-lg flex items-center justify-end space-x-2">
                                <button className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                        onClick={() => setShowSaveAsModal(false)}>Cancel
                                </button>
                                <button
                                    className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                                    onClick={async () => {
                                        const result = await saveDatasetRpc({
                                            ...ds,
                                            id: null,
                                            name: saveAsName
                                        }, {asName: saveAsName});
                                        setDs(prev => ({...prev, id: result.id, name: result.name}));
                                        const list = await listDatasetsInWorkspaceRpc(selectedWs || workspaceId);
                                        setDatasets(list || []);
                                        setShowSaveAsModal(false);
                                    }}>Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* Delete Confirmation Modal */}
                {showDeleteModal && (
                    <div className="fixed inset-0 z-40">
                        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}/>
                        <div
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[420px] border border-slate-200">
                            <div className="px-4 py-3 border-b border-slate-200 font-bold text-red-700 bg-red-50 rounded-t-lg flex items-center">
                                <AlertCircle className="w-4 h-4 mr-2"/> Delete Dataset
                            </div>
                            <div className="p-6 text-sm text-slate-700">Are you sure you want to delete <span className="font-bold text-slate-900">"{ds.name}"</span>? This
                                action cannot be undone.
                            </div>
                            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-lg flex items-center justify-end space-x-2">
                                <button className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                        onClick={() => setShowDeleteModal(false)}>Cancel
                                </button>
                                <button
                                    className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 shadow-sm"
                                    onClick={async () => {
                                        suppressSaveRef.current = true;
                                        await deleteDatasetRpc(ds.id);
                                        setShowDeleteModal(false);
                                        const blank = initialDataset(workspaceId);
                                        setDs(blank);
                                        lastSavedHashRef.current = datasetHash(blank);
                                        const list = await listDatasetsInWorkspaceRpc(selectedWs || workspaceId);
                                        setDatasets(list || []);
                                        setTimeout(() => { suppressSaveRef.current = false; }, 0);
                                    }}>Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* Select Dataset Dialog (Generic) */}
                {showSelectDatasetDialog && (
                    <GenericLoadDialog
                        isOpen={showSelectDatasetDialog}
                        onClose={() => setShowSelectDatasetDialog(false)}
                        title="Select Dataset"
                        listWorkspaces={listWorkspacesRpc}
                        listItemsInWorkspace={async (wsId) => {
                            const all = await listDatasetsInWorkspaceRpc(wsId);
                            // Block self-reference and datasets already added as INTERNAL sources
                            const blocked = new Set(
                                ds.sources
                                    .filter(s => s.type === SOURCE_TYPES.INTERNAL)
                                    .map(s => s.payload.datasetId)
                            );
                            if (ds.id) blocked.add(ds.id);
                            return (all || []).filter(d => !blocked.has(d.id));
                        }}
                        initialWorkspaceId={selectedWs || workspaceId}
                        onSelect={(item, wsId) => {
                            if (!item) return;
                            const id = `${SOURCE_TYPES.INTERNAL}:${item.id}`;
                            setDs(prev => ({
                                ...prev,
                                sources: [...prev.sources, {
                                    id,
                                    type: SOURCE_TYPES.INTERNAL,
                                    label: item.name || `Dataset ${item.id}`,
                                    payload: {datasetId: item.id, workspaceId: wsId},
                                    meta: {addedAt: Date.now()}
                                }]
                            }));
                            setSelectedSourceId(id);
                            setSelectedSubSource(null);
                            setShowSelectDatasetDialog(false);
                        }}
                        emptyText="No datasets in this workspace"
                    />
                )}
                {/* Add Web URL Modal */}
                {showAddWebModal && (
                    <div className="fixed inset-0 z-40">
                        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowAddWebModal(false)}/>
                        <div
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[520px] border border-slate-200">
                            <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 bg-slate-50 rounded-t-lg">Add Web URL</div>
                            <div className="p-4 space-y-2">
                                <div className="text-sm text-slate-600 font-medium">URL</div>
                                <input className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" value={webUrl}
                                       onChange={e => setWebUrl(e.target.value)} placeholder="https://example.com"/>
                            </div>
                            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-lg flex items-center justify-end space-x-2">
                                <button className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                        onClick={() => setShowAddWebModal(false)}>Cancel
                                </button>
                                <button
                                    className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                                    onClick={confirmAddWebUrl}>Add
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* Add Glob Modal */}
                {showAddGlobModal && (
                    <div className="fixed inset-0 z-40">
                        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowAddGlobModal(false)}/>
                        <div
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[520px] border border-slate-200">
                            <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-700 bg-slate-50 rounded-t-lg">Add Glob Pattern</div>
                            <div className="p-4 space-y-2">
                                <div className="text-sm text-slate-600 font-medium">Glob</div>
                                <input
                                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="e.g. /data/ds1/**/*.pdf"
                                    value={globPattern}
                                    onChange={e => setGlobPattern(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            addGlob();
                                            setShowAddGlobModal(false);
                                        }
                                    }}/>
                            </div>
                            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-lg flex items-center justify-end space-x-2">
                                <button className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                        onClick={() => setShowAddGlobModal(false)}>Cancel
                                </button>
                                <button
                                    className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                                    onClick={() => {
                                        addGlob();
                                        setShowAddGlobModal(false);
                                    }}>Add
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
