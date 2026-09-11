import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Progress from '@radix-ui/react-progress';
import {CheckIcon, ChevronRight, File as FileIcon, Folder as FolderIcon, Loader2, Upload} from 'lucide-react';
import {useChatState} from "../../hooks/useChatState";
import {useWebSocketApi} from "../../hooks/useWebSocketApi.js";
import {useFileUploader} from "../../utils/FileUploadFunctions.jsx";
import {formatFileSize, generateUUID} from '../../lib/utils';
import {USER} from "../../constants/WebSocketConstants.jsx";
import {DEBUG_MODE} from "../../constants/AppConstants";
import RefreshButton from "../UI/RefreshButton.jsx";

/**
 * FileBrowser: a styled, file browser with folder navigation, breadcrumbs,
 * search/filter, sortable columns, selection highlights, and multi-select (Ctrl/Shift/Cmd).
 * Displays selected doc_ids in a list below the table. Also has upload and create folder functionality.
 *
 * Props:
 * - data: flat array of items with { name, modified, size, provider, path, doc_id }
 * - onSyncMetadata: () => void
 * - onIngest: (selectedItems) => void
 * - canIngest: (selectedItems) => boolean
 */
export default function FileBrowser({
                                        data,
                                        workspaceId,
                                        onSyncMetadata,
                                        onIngest,
                                        onUploadCompletion,
                                        onDelete,
                                        refreshFunction,
                                        threadId = null,
                                        canIngest = (sel) => sel.length > 0,
                                        initialPath = '',
                                        // What the owning app wants done with uploads at ingest
                                        // time, e.g. {decompose: false} for a corpus retrieved by
                                        // page search and transcript, where fact decomposition
                                        // (~35-40 facts per page, each scheduling its own work)
                                        // produces output nothing reads. Null = no opinion.
                                        ingestFlags = null,
                                        // chat reference configuration
                                        showReferenceInChat = true,
                                        clearChatDocumentsOnReference = true,
                                        customChatReferenceAction = null, // custom action (callable)
                                        chatReferenceText = "Reference in Chat",
                                        // other UI options
                                        showDataSourceColumn = true,
                                        showSelectedKeys = false, // useful for debugging?
                                        showBreadcrumbs = true,
                                        showCrumbsTrueRoot = true,
                                        ingestButtonTitle = 'Ingest Now',
                                        ingestTakesObjects = false,
                                    }) {
    // TODO: make "reference in Chat" button configurable to "reference in..." so it can be reused as a widget
    // TODO: have max height property to trigger scrollbar
    // Strip leading "/" from initialPath and use as root
    const rootPath = initialPath.startsWith('/') ? initialPath.slice(1) : initialPath;
    const [currentPath, setCurrentPath] = useState(rootPath);

    // Re-root when the OWNER changes initialPath. useState only reads its
    // argument on first mount, so without this the browser keeps the folder it
    // was first mounted with: selecting a different folder in an embedded application
    // re-rendered with initialPath=/Bids/<new> while currentPath stayed
    // /Bids/<first>. Because currentPath is what becomes the upload's
    // sourcePath (below), every subsequent upload was filed under the FIRST
    // bidder — silently, and looking correct in the UI until you inspected the
    // path. Keyed on the derived string, so it fires only on a real change and
    // does not fight in-component navigation.
    useEffect(() => {
        setCurrentPath(rootPath);
    }, [rootPath]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [sortBy, setSortBy] = useState({key: 'name', asc: true});
    const [selectedKeys, setSelectedKeys] = useState(new Set());
    const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
    const [uploads, setUploads] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    // Refs whose delete is in flight. Held only for the duration of the call:
    // the row stays visible but dimmed, then the refresh that follows removes
    // it for real. Unlike an optimistic ADD, this cannot strand anything —
    // a failed delete just restores the row on the next listing.
    const [pendingDeletes, setPendingDeletes] = useState(() => new Set());
    const {addDocument, clearDocuments} = useChatState();  // addAttachment
    const {uploadFile, notifyUploadComplete} = useFileUploader(workspaceId);
    const {sendRpcRequest, registerAppListener} = useWebSocketApi();
    const fileInputRef = useRef(null);
    // Coalesce rapid terminal ingest events into a single refresh.
    const refreshTimerRef = useRef(null);

    // DEBUG_MODE && console.log(rootPath);
    // DEBUG_MODE && console.log(initialPath);
    // DEBUG_MODE && console.log(data);

    // breadcrumbs
    const crumbs = useMemo(() => {
        // If currentPath equals rootPath, we're at root
        if (currentPath === rootPath) {
            return [rootPath];
        }
        // If currentPath starts with rootPath, get relative path
        const relativePath = currentPath.startsWith(rootPath + '/')
            ? currentPath.slice(rootPath.length + 1)
            : currentPath.startsWith(rootPath) && rootPath
                ? currentPath.slice(rootPath.length)
                : currentPath;
        const segs = relativePath ? relativePath.split('/').filter(s => s) : [];
        return [rootPath].concat(segs);
    }, [currentPath, rootPath]);

    // Drop refs from the pending-delete set once the server stops returning
    // them, so a completed delete releases its row rather than leaking a
    // dimmed entry into every later listing.
    useEffect(() => {
        setPendingDeletes((prev) => {
            if (!prev.size) return prev;
            const live = new Set();
            (data || []).forEach((item) => {
                if (item?.vfs_ref) live.add(item.vfs_ref);
                if (item?.doc_id) live.add(item.doc_id);
            });
            const next = new Set([...prev].filter((k) => live.has(k)));
            return next.size === prev.size ? prev : next;
        });
    }, [data]);

    // filter data
    const filtered = useMemo(() => {
        const q = globalFilter.toLowerCase();
        return data?.filter(item =>
            (item.name || '').toLowerCase().includes(q) ||
            (item.provider || '').toLowerCase().includes(q));
    }, [data, globalFilter]);

    // derive folders and files
    const {folders, files} = useMemo(() => {
        const split = (p) => (p && p !== '.' ? p.split('/').filter(Boolean) : []);

        const rootSegs = split(rootPath);
        const currSegs = split(currentPath);

        // current path relative to rootPath
        const relSegs =
            rootSegs.length &&
            currSegs.slice(0, rootSegs.length).join('/') === rootSegs.join('/')
                ? currSegs.slice(rootSegs.length)
                : (!rootSegs.length ? currSegs : []); // if no rootPath, current is already relative

        const depth = relSegs.length;

        const folderSet = new Set();
        const fileRows = [];

        filtered?.forEach((item) => {
            const parts = split(item.path);

            // 1) constrain to rootPath
            if (rootSegs.length) {
                for (let i = 0; i < rootSegs.length; i++) {
                    if (parts[i] !== rootSegs[i]) return; // outside rootPath
                }
            }

            // 2) item path relative to rootPath
            const relParts = parts.slice(rootSegs.length);

            // 3) must match the current relative prefix
            for (let i = 0; i < depth; i++) {
                if (relParts[i] !== relSegs[i]) return;
            }

            // 4) same-depth => file; deeper => collect immediate child folder
            if (relParts.length === depth) {
                fileRows.push(item);
            } else if (relParts.length > depth) {
                folderSet.add(relParts[depth]);
            }
        });

        // DEBUG_MODE && console.log(tResult);
        return {
            folders: Array.from(folderSet).sort((a, b) => a.localeCompare(b)),
            files: fileRows,
        };
    }, [filtered, currentPath, rootPath]);


    // sort files
    const sortedFiles = useMemo(() => {
        return [...files].sort((a, b) => {
            const aVal = a[sortBy.key];
            const bVal = b[sortBy.key];
            if (aVal < bVal) return sortBy.asc ? -1 : 1;
            if (aVal > bVal) return sortBy.asc ? 1 : -1;
            return 0;
        });
    }, [files, sortBy]);

    // Row identity for selection, React keys and delete. Prefer vfs_ref: it is
    // the stable handle (it exists from the moment of upload), whereas doc_id
    // only appears once ingestion links a MemoryLayer document — so keying on
    // doc_id left un-ingested rows with an empty key, unselectable and
    // colliding with each other. It is also what delete needs, since removing
    // a file has to drop the VFS entry as well as the document.
    const rowKey = (f) => f?.vfs_ref || f?.doc_id;

    // multi-select logic
    const allKeys = sortedFiles.map(rowKey).filter(Boolean);
    const allSelected = allKeys.length > 0 && allKeys.every(k => selectedKeys.has(k));
    // const someSelected = selectedKeys.size > 0 && !allSelected;

    const onToggleAll = (checked) => {
        if (checked) setSelectedKeys(new Set(allKeys)); else setSelectedKeys(new Set());
    };

    const onToggleRow = (key, checked) => {
        const s = new Set(selectedKeys);
        if (checked) s.add(key); else s.delete(key);
        setSelectedKeys(s);
        setLastSelectedIndex(sortedFiles.findIndex(f => rowKey(f) === key));
    };

    const onRowClick = (e, doc_id, idx) => {
        if (e.shiftKey && lastSelectedIndex !== null) {
            const start = Math.min(lastSelectedIndex, idx);
            const end = Math.max(lastSelectedIndex, idx);
            const rangeKeys = sortedFiles.slice(start, end + 1).map(rowKey).filter(Boolean);
            const s = new Set(selectedKeys);
            rangeKeys.forEach(k => s.add(k));
            setSelectedKeys(s);
        } else if (e.ctrlKey || e.metaKey) {
            const s = new Set(selectedKeys);
            if (s.has(doc_id)) s.delete(doc_id); else s.add(doc_id);
            setSelectedKeys(s);
            setLastSelectedIndex(idx);
        } else {
            // simple click: select/unselect only this
            if (selectedKeys.has(doc_id)) {
                setSelectedKeys(new Set());
            } else {
                setSelectedKeys(new Set([doc_id]));
            }
            setLastSelectedIndex(idx);
        }
    };

    // clear selection on path change
    useEffect(() => setSelectedKeys(new Set()), [currentPath]);

    // File upload handling
    const handleFiles = useCallback((files) => {
        const fileArray = Array.from(files);

        const newUploads = fileArray.map(file => ({
            id: generateUUID(),
            file,
            name: file.name,
            size: file.size,
            progress: 0,
            status: 'pending',
            cancelFn: null,
            key: null,
        }));

        setUploads(prev => [...prev, ...newUploads]);

        let completed = 0;
        let failed = 0;
        const keys = [];

        newUploads.forEach(entry => {
            const controller = new AbortController();

            uploadFile({
                file: entry.file,
                threadId, // threadId can be used in various ways... but is configured externally for maximum flexibility
                // The browser's current folder becomes the VFS entry's source_path,
                // so the owning app can list its own files back by prefix. This is
                // what makes an app's folder structure real rather than cosmetic:
                // without it every entry is filed under its bare filename and a
                // per-folder listing cannot be expressed at all.
                sourcePath: `${currentPath ? '/' + currentPath : ''}/${entry.file.name}`,
                ingestFlags,
                signal: controller.signal, // TODO: how is signal used? (uploadFile doesn't have a field/param for it)
                onStart: () => {
                    updateUpload(entry.id, {status: 'uploading'});
                },
                onProgress: (_, pct) => {
                    updateUpload(entry.id, {progress: pct});
                },
                onFinish: (key, err) => {
                    if (err) {
                        failed++;
                        updateUpload(entry.id, {status: 'error', error: err?.message || String(err)});
                    } else {
                        updateUpload(entry.id, {progress: 100, status: 'done', key});
                        keys.push(key);
                    }
                    completed++;
                    if (completed === newUploads.length) {
                        // Clear the upload tray only when everything SUCCEEDED.
                        // Clearing unconditionally erased the sole report that
                        // an upload failed — the file never appeared and no
                        // error remained on screen to say why.
                        if (!failed) setUploads([]);

                        // Trigger the ingest pipeline (FILE_UPLOAD_COMPLETE).
                        if (keys.length) {
                            notifyUploadComplete(keys, {visibility: 'workspace'});
                        }

                        if (onUploadCompletion) {
                            const fileDetails = newUploads.map(u => ({name: u.name, size: u.size}));
                            onUploadCompletion(keys, fileDetails);
                        }
                        // onUploadCompletion handles refresh after registering pending state;
                        // call refreshFunction only if no completion handler was provided
                        if (!onUploadCompletion) {
                            refreshFunction && refreshFunction();
                        }
                    } else {
                        // intermediate file completed; refresh to show updated progress
                        refreshFunction && refreshFunction();
                    }
                }
            });

            updateUpload(entry.id, {cancelFn: () => controller.abort()});
        });
    }, [uploadFile, threadId, onUploadCompletion, refreshFunction, notifyUploadComplete, currentPath]);

    // Refresh once the ingest pipeline reports done, so a row picks up the
    // doc_id it gains at ingest. Upload state itself is NOT tracked here: it
    // is derived from the server's own record of the file, so a missed or
    // out-of-order event can no longer strand a row in "Processing".
    useEffect(() => {
        if (!registerAppListener) return undefined;

        const scheduleRefresh = () => {
            if (refreshTimerRef.current) return; // coalesce rapid events
            refreshTimerRef.current = setTimeout(() => {
                refreshTimerRef.current = null;
                refreshFunction && refreshFunction();
            }, 750);
        };

        const unsubscribe = registerAppListener(USER.APP_PROGRESS, (payload) => {
            if (!payload || payload.bg_kind !== 'ingest') return;
            // Only react to terminal ingest events for the current workspace.
            if (payload.workspace && workspaceId && payload.workspace !== workspaceId) return;
            if (payload.status !== 'completed') return;
            scheduleRefresh();
        }, 'LibraryFileBrowser');

        return () => {
            unsubscribe?.();
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [registerAppListener, workspaceId, refreshFunction]);

    // Delete with immediate feedback. The rows dim right away and the
    // selection clears, then the listing refresh removes them for good —
    // previously the click produced no visible change at all until the user
    // manually refreshed, which reads as a failed delete.
    const handleDelete = useCallback(async (keys) => {
        if (!keys?.length || !onDelete) return;
        setPendingDeletes((prev) => new Set([...prev, ...keys]));
        setSelectedKeys(new Set());
        try {
            await onDelete(keys);
        } catch (err) {
            DEBUG_MODE && console.error('delete failed', err);
        } finally {
            // Release the hold regardless. If the delete actually failed the
            // row is still in the next listing and simply un-dims, rather
            // than being stuck dimmed and un-actionable forever.
            setPendingDeletes((prev) => {
                const next = new Set(prev);
                keys.forEach((k) => next.delete(k));
                return next;
            });
        }
        refreshFunction && refreshFunction();
    }, [onDelete, refreshFunction]);

    const updateUpload = (id, changes) =>
        setUploads((prev) => prev.map(u => u.id === id ? {...u, ...changes} : u));

    const removeUpload = (id) => {
        const u = uploads.find(u => u.id === id);
        u?.cancelFn?.(); // cancel if possible
        setUploads((prev) => prev.filter(u => u.id !== id));
    };

    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    const onDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e) => {
        e.preventDefault();
        // Only set isDragging to false if we're actually leaving the drop zone
        // and not just moving between child elements
        const dropZone = e.currentTarget;
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || !dropZone.contains(relatedTarget)) {
            setIsDragging(false);
        }
    };

    const onSelect = (e) => handleFiles(e.target.files);

    // Create folder functionality
    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) {
            return; // Don't create empty folder names
        }

        try {
            // TODO: implement RPC tool call
            // The RPC method name and payload structure will be implemented by the user
            // This is just a placeholder
            const result = await sendRpcRequest('CREATE_FOLDER', {
                folderName: newFolderName.trim(),
                path: currentPath,
                workspaceId: workspaceId,
            });

            DEBUG_MODE && console.log('Folder created:', result);

            // Reset state and refresh the file list
            setNewFolderName('');
            setShowCreateFolderModal(false);

            // TODO: refresh table view!
            // onSyncMetadata && onSyncMetadata();
        } catch (error) {
            console.error('Error creating folder:', error);
            // You might want to show an error message to the user here
        }
    };

    // ~~~ TMP: path testing stuff! ~~~
    //
    // TODO: be able to do something with pathParams BUT... it'd be better
    //       if this is fed into the widget rather than inherent to make it
    //       possible to flexibly re-use this widget...
    // const {useAppPathState} = (legacy useAppState); // TODO: rewire via appPanelStore
    // const [pathParams, setPathParams] = useAppPathState();
    //
    // useEffect(() => {
    //     DEBUG_MODE && console.log('path params:', pathParams);
    // }, [pathParams]);
    //
    // ~~~ TMP: path testing stuff! ~~~

    return (<div className="bg-white rounded-lg shadow p-4 flex flex-col space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
            <input
                type="text"
                value={globalFilter}
                onChange={e => setGlobalFilter(e.target.value)}
                placeholder="Filter files..."
                className="border border-gray-300 rounded-md px-3 py-1 text-sm w-1/3"
            />
            <div className="flex items-center space-x-2">
                {/* TODO: make sync metadata and ingest button require admin rights and/or DEV mode ?? */}
                {refreshFunction && (
                    <RefreshButton
                        onRefresh={refreshFunction}
                    />
                )}
                {onSyncMetadata && (
                    <button
                        onClick={onSyncMetadata}
                        className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md"
                    >Sync Metadata
                    </button>
                )}
                {onDelete && (
                    <button
                        onClick={() => handleDelete(Array.from(selectedKeys))}
                        className={`text-sm px-3 py-1 bg-gray-100 rounded-md disabled:opacity-50 ${selectedKeys.size > 0 ? 'hover:bg-gray-200' : ''}`}
                        disabled={selectedKeys.size === 0}
                    >Delete Files
                    </button>
                )}

                {/*<button*/}
                {/*    className="text-sm px-4 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-500 flex items-center"*/}
                {/*    onClick={() => setShowCreateFolderModal(true)}*/}
                {/*>*/}
                {/*    <FolderPlus className="w-4 h-4 mr-1"/>*/}
                {/*    New Folder*/}
                {/*</button>*/}
                <button
                    className="text-sm px-4 py-1 bg-purple-700 text-white rounded-md hover:bg-purple-600 flex items-center"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload className="w-4 h-4 mr-1"/>
                    Upload
                </button>
                {showReferenceInChat &&
                    <button
                        disabled={!canIngest(Array.from(selectedKeys))}
                        className="text-sm px-4 py-1 bg-green-800 text-white disabled:opacity-50 rounded-md hover:bg-green-700"
                        onClick={() => {
                            if (clearChatDocumentsOnReference) {
                                clearDocuments();
                            }
                            sortedFiles.filter(f => selectedKeys.has(rowKey(f))).forEach((f) =>
                                addDocument({
                                    // Attach the VFS ref, NOT the ML doc_id: the agent (sahara)
                                    // materializes document file parts to disk by vfs_ref. A doc_id
                                    // can't be resolved by the data-connectors VFS, so it's silently
                                    // dropped and the document never reaches the system prompt.
                                    // Fall back to doc_id only when no vfs_ref exists.
                                    id: f.vfs_ref || f.doc_id, label: f.name
                                }));
                            if (customChatReferenceAction) {
                                customChatReferenceAction();
                            }
                        }}
                    >{chatReferenceText}
                    </button>}
                {onIngest && (<button
                    onClick={() =>
                        onIngest(
                            Array.from(
                                ingestTakesObjects ?
                                    sortedFiles.filter(f => selectedKeys.has(rowKey(f)))
                                    : selectedKeys
                            ))}
                    disabled={!canIngest(Array.from(selectedKeys))}
                    className="text-sm px-4 py-1 bg-blue-700 text-white disabled:opacity-50 rounded-md hover:bg-blue-600"
                >{ingestButtonTitle}
                </button>)}
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={onSelect}
                />
            </div>
        </div>

        {/* Upload Progress Display */}
        {uploads.length > 0 && (
            <div className="mt-4 mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-medium">Uploads</h3>
                    <button
                        onClick={() => setUploads([])}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        Clear All
                    </button>
                </div>

                <div className="mt-2">
                    <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                    <Progress.Root
                        value={uploads.length ? Math.round(uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length) : 0}
                        max={100}
                        className="relative w-full h-2 bg-gray-200 rounded overflow-hidden mt-1"
                    >
                        <Progress.Indicator
                            className="h-full bg-blue-500 transition-all"
                            style={{width: `${uploads.length ? Math.round(uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length) : 0}%`}}
                        />
                    </Progress.Root>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto"
                     style={{maxHeight: '16rem'}}>
                    {uploads.map((u) => (
                        <div key={u.id} className="relative bg-white shadow rounded-md p-2">
                            <div className="flex justify-between items-center mb-1">
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-gray-800 truncate">{u.name}</span>
                                    <span className="text-xs text-gray-500">{formatFileSize(u.size)}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                    {u.status === 'error' && <span className="text-xs text-red-500">Error</span>}
                                    <button onClick={() => removeUpload(u.id)}
                                            className="text-gray-400 hover:text-gray-600 text-xs">×
                                    </button>
                                </div>
                            </div>
                            <Progress.Root value={u.progress} max={100}
                                           className="relative w-full h-1 bg-gray-200 rounded overflow-hidden">
                                <Progress.Indicator className="h-full bg-blue-500 transition-all"
                                                    style={{width: `${u.progress}%`}}/>
                            </Progress.Root>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Create Folder Modal */}
        {showCreateFolderModal && (
            <div className="mt-4 mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-medium">Create New Folder</h3>
                    <button
                        onClick={() => {
                            setShowCreateFolderModal(false);
                            setNewFolderName('');
                        }}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        ×
                    </button>
                </div>

                <div className="mt-2">
                    <label htmlFor="folderName" className="block text-sm font-medium text-gray-700 mb-1">
                        Folder Name
                    </label>
                    <input
                        type="text"
                        id="folderName"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Enter folder name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleCreateFolder();
                            }
                        }}
                    />
                </div>

                <div className="mt-4 flex justify-end space-x-2">
                    <button
                        onClick={() => {
                            setShowCreateFolderModal(false);
                            setNewFolderName('');
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreateFolder}
                        disabled={!newFolderName.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Create Folder
                    </button>
                </div>
            </div>
        )}

        {/* Breadcrumbs */}
        {showBreadcrumbs &&
            <nav className="flex items-center text-sm text-gray-600">
                {crumbs.map((seg, idx) => (<React.Fragment key={idx}>
                    {idx > 0 && <ChevronRight className="w-4 h-4 mx-1"/>}
                    {idx === 0 && rootPath && showCrumbsTrueRoot ? (
                        // Root path - non-clickable, informational only
                        <span className="text-gray-500 font-medium">
                        /{rootPath}
                    </span>
                    ) : (
                        // Clickable breadcrumb segments
                        <button
                            onClick={() => {
                                if (idx === 0) {
                                    // Clicking on root (when no rootPath)
                                    setCurrentPath(rootPath);
                                } else {
                                    // Clicking on a subdirectory
                                    const pathSegments = crumbs.slice(1, idx + 1);
                                    const newPath = rootPath ? `${rootPath}/${pathSegments.join('/')}` : pathSegments.join('/');
                                    setCurrentPath(newPath);
                                }
                            }}
                            className="hover:underline"
                        >
                            {idx === 0 ? 'Home' : seg}
                        </button>
                    )}
                </React.Fragment>))}
            </nav>}

        {/* File table - acts as drop zone for file uploads */}
        <div
            className={`relative ${isDragging ? 'bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
        >
            {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center bg-blue-50 bg-opacity-70 z-10">
                    <div className="text-lg font-medium text-blue-600">Drop files here to upload</div>
                </div>
            )}
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                <tr className="bg-gray-50">
                    <th className="px-2 py-2 text-left">
                        <Checkbox.Root
                            checked={allSelected}
                            onCheckedChange={onToggleAll}
                            className="w-5 h-5 p-[2px] bg-white border rounded border-gray-300"
                        >
                            <Checkbox.Indicator>
                                <CheckIcon className="w-4 h-4 text-blue-600"/>
                            </Checkbox.Indicator>
                        </Checkbox.Root>
                    </th>
                    {(showDataSourceColumn ?
                        ['name', 'modified', 'size', 'provider'] :
                        ['name', 'modified', 'size']).map(col => (<th
                        key={col}
                        className="px-4 py-2 text-left cursor-pointer"
                        onClick={() => setSortBy({key: col, asc: sortBy.key === col ? !sortBy.asc : true})}
                    >
                        {col === 'provider' ? 'Data Source' : col.charAt(0).toUpperCase() + col.slice(1)}
                        {sortBy.key === col && (sortBy.asc ? ' ▲' : ' ▼')}
                    </th>))}
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {/* folders */}
                {folders.map(folder => (<tr
                    key={folder}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setCurrentPath(currentPath ? `${currentPath}/${folder}` : (rootPath ? `${rootPath}/${folder}` : folder))}
                >
                    <td className="px-2 py-2"/>
                    <td className="px-4 py-2 flex items-center space-x-2 text-gray-800">
                        <FolderIcon className="w-5 h-5 text-gray-500"/>
                        <span>{folder}</span>
                    </td>
                    <td className="px-4 py-2">—</td>
                    <td className="px-4 py-2">—</td>
                    <td className="px-4 py-2">—</td>
                </tr>))}

                {/* files */}
                {sortedFiles.map((item, idx) => {
                    // Upload state comes from the server's own record of the
                    // file (no content hash yet => bytes still arriving).
                    const isUploading = Boolean(item.uploading);
                    const isDeleting = pendingDeletes.has(rowKey(item));
                    const isPending = isUploading || isDeleting;
                    const isSelected = !isPending && selectedKeys.has(rowKey(item));
                    return (<tr
                        key={rowKey(item)}
                        className={`${isDeleting ? 'opacity-40 line-through' : isUploading ? 'bg-yellow-50 opacity-70' : `cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}`}
                        onClick={e => !isPending && onRowClick(e, rowKey(item), idx)}
                    >
                        <td className="px-2 py-2">
                            {isPending ? (
                                <Loader2 className={`w-4 h-4 animate-spin ${isDeleting ? 'text-red-500' : 'text-yellow-600'}`}/>
                            ) : (
                                <Checkbox.Root
                                    checked={isSelected}
                                    onCheckedChange={c => onToggleRow(rowKey(item), Boolean(c))}
                                    className="w-5 h-5 p-[2px] bg-white border rounded border-gray-300"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <Checkbox.Indicator>
                                        <CheckIcon className="w-4 h-4 text-blue-600"/>
                                    </Checkbox.Indicator>
                                </Checkbox.Root>
                            )}
                        </td>
                        <td className="px-4 py-2 flex items-center space-x-2 text-gray-800">
                            <FileIcon className={`w-5 h-5 ${isUploading ? 'text-yellow-400' : 'text-gray-400'}`}/>
                            <span>{item.name}</span>
                            {isDeleting ? (
                                <span
                                    className="ml-1 inline-flex items-center text-xs font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded">Deleting...</span>
                            ) : isUploading ? (
                                <span
                                    className="ml-1 inline-flex items-center text-xs font-medium text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">Uploading...</span>
                            ) : null}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{isUploading ? '—' : new Intl.DateTimeFormat('en-US', {
                            dateStyle: 'short', timeStyle: 'short'
                        }).format(new Date(item.modified))}</td>
                        <td className="px-4 py-2 text-gray-600">{isUploading ? '—' : formatFileSize(item.size)}</td>
                        {showDataSourceColumn &&
                            <td className="px-4 py-2 text-gray-600">{item.provider === '_scitrera' ? "(Scitrera)" : item.provider}</td>}
                    </tr>);
                })}
                </tbody>
            </table>
        </div>
        {
            /* Selected IDs list */
            showSelectedKeys &&
            <div className="text-sm text-gray-700">
                <strong>Selected:</strong> {Array.from(selectedKeys).join(', ') || 'None'}
            </div>
        }
    </div>);
}
