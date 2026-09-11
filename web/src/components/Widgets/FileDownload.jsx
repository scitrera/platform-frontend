import React, {useState, useCallback, useEffect, useMemo} from 'react';
import {useWebSocket} from '../../hooks/useWebSocket.jsx';
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
        if (!docId || isDownloading) return;

        setIsDownloading(true);
        onDownloadStart && onDownloadStart(docId);

        // to ensure compatibility with Chrome+ for altDownloadName, we download to a blob
        // and then handle from there
        if (altDownloadName) {
            try {
                const {url} = await requestDownloadWithRetry(docId, 1);

                // Use fetch + blob approach for reliable filename setting in Chrome
                // This ensures the download attribute is respected even for remote URLs
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = altDownloadName || fileMetadata?.name || 'download';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                // Clean up the blob URL to free memory
                URL.revokeObjectURL(blobUrl);

                setIsDownloading(false);
                onDownloadComplete && onDownloadComplete(docId);
            } catch (err) {
                console.error('Error downloading file:', err);
                setError('Failed to download file');
                setIsDownloading(false);
                onError && onError(err);
            }
        } else { // if altDownloadName is not defined, then the classic (simpler) approach seems fine
            requestDownloadWithRetry(docId, 1)
                .then(({url}) => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileMetadata?.name || 'download';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    setIsDownloading(false);
                    onDownloadComplete && onDownloadComplete(docId);
                })
                .catch((err) => {
                    console.error('Error getting download URL:', err);
                    setError('Failed to download file');
                    setIsDownloading(false);
                    onError && onError(err);
                });
        }
    }, [docId, isDownloading, fileMetadata, altDownloadName, onDownloadStart, onDownloadComplete, onError, requestDownloadWithRetry]);

    // --- render ---
    if (isLoading) {
        return (
            <div className="bg-white shadow rounded-md p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"/>
                <div className="h-3 bg-gray-200 rounded w-1/2"/>
            </div>
        );
    }

    if (error) {
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
