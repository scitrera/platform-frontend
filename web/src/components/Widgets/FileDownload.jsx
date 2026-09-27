import React, {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import {useWebSocket} from '../../hooks/useWebSocket.jsx';
import {useAuthStore} from '@/stores/authStore';
import {fetchDownloadURL, isTenantBlobURL} from '@/utils/storageFetch';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {formatFileSize, timestampToString} from '../../lib/utils';
import {FileIcon, Download} from 'lucide-react';
import {
    useDocumentMetadata,
    buildDownloadUrlFetcher,
} from '../../hooks/useDocumentPresignedUrl.jsx';

function FileDownloadInner({
                               docId,
                               onDownloadStart = null,
                               onDownloadComplete = null,
                               onError = null,
                               altDownloadName = null,
                           }) {
    const [error, setError] = useState(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const {sendRpcRequest} = useWebSocket();
    const currentWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const tenantId = useAuthStore(s => s.tenantId);
    const storageOrigin = useAuthStore(s => s.uiConfig.storageOrigin);
    const downloadController = useRef(null);
    useEffect(() => {
        setError(null);
        setIsDownloading(false);
        downloadController.current = null;
        return () => {
            downloadController.current?.abort();
            downloadController.current = null;
        };
    }, [docId, currentWorkspaceId, tenantId, storageOrigin]);


    // Metadata + download-URL minting are shared with DynamicContentList's
    // image renderer via hooks/useDocumentPresignedUrl — single cache + one
    // RPC implementation for both surfaces.
    const {
        metadata: fileMetadata,
        isLoading,
        error: metadataError,
    } = useDocumentMetadata(docId, currentWorkspaceId);

    // Surface metadata errors through the same `error` state as download
    // failures, and notify the optional onError callback exactly once.
    useEffect(() => {
        if (metadataError) {
            setError(metadataError);
            onError && onError(new Error(metadataError));
        }
    }, [metadataError, onError]);

    const requestDownloadWithRetry = useMemo(
        () => buildDownloadUrlFetcher(currentWorkspaceId, sendRpcRequest),
        [currentWorkspaceId, sendRpcRequest],
    );

    const handleDownload = useCallback(async () => {
        if (!docId || downloadController.current) return;
        const controller = new AbortController();
        downloadController.current = controller;
        const {signal} = controller;
        setError(null);
        setIsDownloading(true);
        let blobUrl = null;
        try {
            onDownloadStart && onDownloadStart(docId);
            const {url} = await requestDownloadWithRetry(docId, 1, () => !signal.aborted);
            signal.throwIfAborted();
            let downloadUrl = url;
            // Auth-bound blobs need the capability header even without a custom
            // filename. Keep direct downloads for other signed providers.
            if (altDownloadName || isTenantBlobURL(url)) {
                const response = await fetchDownloadURL(url, storageOrigin, signal);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const blob = await response.blob();
                signal.throwIfAborted();
                blobUrl = URL.createObjectURL(blob);
                downloadUrl = blobUrl;
            }
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = altDownloadName || fileMetadata?.name || 'download';
            document.body.appendChild(a);
            try { a.click(); } finally { a.remove(); }
            onDownloadComplete && onDownloadComplete(docId);
        } catch (err) {
            if (!signal.aborted) {
                setError('Failed to download file. Try again.');
                onError && onError(err);
            }
        } finally {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            if (downloadController.current === controller) {
                downloadController.current = null;
                setIsDownloading(false);
            }
        }
    }, [docId, fileMetadata, altDownloadName, storageOrigin, onDownloadStart, onDownloadComplete, onError, requestDownloadWithRetry]);

    // --- render ---
    if (isLoading) {
        return (
            <div className="bg-white shadow rounded-md p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"/>
                <div className="h-3 bg-gray-200 rounded w-1/2"/>
            </div>
        );
    }

    if (error && !fileMetadata) {
        return (
            <div className="bg-white shadow rounded-md p-4 border-l-4 border-red-500">
                <p className="text-red-500 text-sm">{error}</p>
            </div>
        );
    }

    if (!fileMetadata) {
        return (
            <div className="bg-white shadow rounded-md p-4 border-l-4 border-yellow-500">
                <p className="text-yellow-500 text-sm">File not found</p>
            </div>
        );
    }

    return (
        <div className="bg-white shadow rounded-md p-4 hover:shadow-md transition-shadow">
            {error && <p role="alert" className="text-red-500 text-sm mb-2">{error}</p>}
            <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                    <FileIcon className="w-8 h-8 text-gray-400"/>
                    <div>
                        <h3 className="text-sm font-medium text-gray-800 wrap-normal">{altDownloadName || fileMetadata.name}</h3>
                        <div className="flex space-x-3 text-xs text-gray-500">
                            <span>{formatFileSize(fileMetadata.size)}</span>
                            {fileMetadata.modified && (
                                <span>{timestampToString(fileMetadata.modified)}</span>
                            )}
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-full disabled:opacity-50"
                    title="Download file"
                >
                    <Download className="w-5 h-5"/>
                </button>
            </div>
        </div>
    );
}

// only re-render if docId (or callbacks, altDownloadName) change
export const FileDownload = React.memo(
    FileDownloadInner,
    (prev, next) =>
        prev.docId === next.docId &&
        prev.onDownloadStart === next.onDownloadStart &&
        prev.onDownloadComplete === next.onDownloadComplete &&
        prev.onError === next.onError &&
        prev.altDownloadName === next.altDownloadName
);
