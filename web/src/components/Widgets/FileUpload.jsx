import React, {useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle} from 'react';
import * as Progress from '@radix-ui/react-progress';
import {formatFileSize, generateUUID, sessionStorageStateInit} from '../../lib/utils';
import {useFileUploader} from "../../utils/FileUploadFunctions.jsx";

export const FileUpload = forwardRef(({
                                          workspaceId,
                                          onUploadStarting = null,
                                          onProgress = null,
                                          onUploadComplete = null,
                                          multiple = true,
                                          text = 'Drag files here or click to upload',
                                          maxListHeight = '16rem',
                                          columns = {base: 1, sm: 2, lg: 3},
                                          storageKey = null,
                                      }, ref) => {
    const {uploadFile, notifyUploadComplete} = useFileUploader(workspaceId);
    const [uploads, setUploads] = useState(sessionStorageStateInit(storageKey, []));
    const inputRef = useRef(null);

    // sessionStorage sync
    useEffect(() => {
        if (storageKey) {
            sessionStorage.setItem(storageKey, JSON.stringify(uploads));
        }
    }, [uploads, storageKey]);

    // imperative methods
    useImperativeHandle(ref, () => ({
        getUploads: () => uploads,
        setUploads: (arr) => setUploads(arr),
        clearAll: () => setUploads([]),
    }), [uploads]);

    const updateUpload = (id, changes) =>
        setUploads((prev) => prev.map(u => u.id === id ? {...u, ...changes} : u));

    const removeUpload = (id) => {
        const u = uploads.find(u => u.id === id);
        u?.cancelFn?.(); // cancel if possible
        setUploads((prev) => prev.filter(u => u.id !== id));
    };

    const handleFiles = useCallback((files) => {
        const fileArray = Array.from(files);
        onUploadStarting?.(fileArray);

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
        const keys = [];

        newUploads.forEach(entry => {
            const controller = new AbortController();

            uploadFile({
                file: entry.file,
                threadId: storageKey,
                signal: controller.signal,
                onStart: () => {
                    updateUpload(entry.id, {status: 'uploading'});
                },
                onProgress: (_, pct) => {
                    updateUpload(entry.id, {progress: pct});
                    onProgress?.(entry.id, pct);
                },
                onFinish: (key, err) => {
                    if (err) {
                        updateUpload(entry.id, {status: 'error'});
                    } else {
                        updateUpload(entry.id, {progress: 100, status: 'done', key});
                        keys.push(key);
                    }
                    completed++;
                    if (completed === newUploads.length) {
                        // Trigger user-initiated (BATCH) document ingestion for
                        // the successfully uploaded files. Each key is the
                        // vfs_ref minted by FILE_UPLOAD_POST. Batched into one
                        // FILE_UPLOAD_COMPLETE message. Visibility defaults to
                        // 'workspace' (a future UI control can pass 'private').
                        notifyUploadComplete(keys, {visibility: 'workspace'});
                        onUploadComplete?.(keys);
                    }
                }
            });

            updateUpload(entry.id, {cancelFn: () => controller.abort()});
        });
    }, [uploadFile, notifyUploadComplete, onUploadStarting, onProgress, onUploadComplete, storageKey]);

    const onDrop = (e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
    };

    const onSelect = (e) => handleFiles(e.target.files);
    const overallProgress = uploads.length ? Math.round(uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length) : 0;
    const gridColsClass = `grid-cols-${columns.base} sm:grid-cols-${columns.sm} lg:grid-cols-${columns.lg}`;

    return (
        <div>
            <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors"
            >
                <input ref={inputRef} type="file" multiple={multiple} className="hidden" onChange={onSelect}/>
                <p className="text-gray-600">{text}</p>
            </div>

            {uploads.length > 0 && (
                <>
                    <div className="mt-4 flex justify-end">
                        <button onClick={() => setUploads([])} className="text-sm text-red-500 hover:underline">
                            Clear All
                        </button>
                    </div>

                    <div className="mt-4">
                        <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                        <Progress.Root value={overallProgress} max={100}
                                       className="relative w-full h-2 bg-gray-200 rounded overflow-hidden mt-1">
                            <Progress.Indicator className="h-full bg-blue-500 transition-all"
                                                style={{width: `${overallProgress}%`}}/>
                        </Progress.Root>
                    </div>

                    <div className={`mt-4 grid ${gridColsClass} gap-4 overflow-y-auto`}
                         style={{maxHeight: maxListHeight}}>
                        {uploads.map((u) => (
                            <div key={u.id} className="relative bg-white shadow rounded-md p-2">
                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-gray-800 truncate">{u.name}</span>
                                        <span className="text-xs text-gray-500">{formatFileSize(u.size)}</span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        {u.status === 'error' && <span className="text-xs text-red-500">Err</span>}
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
                </>
            )}
        </div>
    );
});
