/**
 * Document viewer / preview app (``doc-viewer``).
 *
 * Opened in the main panel (alongside chat) with a file's ``vfs_ref`` /
 * ``file_name`` / ``mime`` on the app query params — typically from a chat file
 * chip's "View" action. Fetches the file's raw text and renders it with the
 * right sub-view: Markdown (SciMarkdown), CSV/TSV (virtualized Spreadsheet), or
 * preformatted plain text (code / config / logs). Unsupported/binary types fall
 * back to a download prompt. PDFs/images are a future sub-view (the classifier
 * simply returns null for them today).
 */
import {useCallback, useState} from 'react';
import {AlertCircle, Download, FileText, RefreshCw} from 'lucide-react';
import {useAppPanelStore} from '@/stores/appPanelStore';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useWebSocket} from '@/hooks/useWebSocket.jsx';
import {buildDownloadUrlFetcher, useDocumentMetadata} from '@/hooks/useDocumentPresignedUrl.jsx';
import {previewKindFor} from '@/utils/docViewer';
import {getVfsMeta} from '@/utils/vfsMetaCache';
import {friendlyRefName} from '@/utils/artifactExtractor';
import {SciMarkdown} from '../Chat/SciMarkdown';
import {AppCloseButton} from '../AppCloseButton';
import CsvView from './CsvView';
import {useVfsTextContent} from './useVfsTextContent';

interface DocumentViewerAppProps {
    workspaceId: string;
    panelConfig?: unknown;
    showCloseButton?: boolean;
    onClose?: () => void;
}

// Read a single param off the (URLSearchParams | Record) app-query-params.
const readParam = (
    qp: URLSearchParams | Record<string, string> | null,
    key: string,
): string | null => {
    if (!qp) return null;
    if (qp instanceof URLSearchParams) return qp.get(key);
    return qp[key] ?? null;
};

export default function DocumentViewerApp({workspaceId, showCloseButton, onClose}: DocumentViewerAppProps) {
    const appQueryParams = useAppPanelStore(s => s.appQueryParams);
    const vfsRef = readParam(appQueryParams, 'vfs_ref') || '';

    const {sendRpcRequest} = useWebSocket();
    const storeWorkspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const ws = workspaceId || storeWorkspaceId || '';
    const [downloading, setDownloading] = useState(false);

    // Resolve the file's name/type from the vfs_ref WITHOUT threading file_name/
    // mime through the URL. Primary source: the in-tab vfs-meta cache the chat
    // chip seeded (vfs_ref → {file_name, mime}). A vfs_ref can't be resolved via
    // the doc_id metadata RPC (separate systems), so that RPC is only a
    // best-effort fallback for a cold open (e.g. deep-link) where the cache is
    // cold and the ref happens to also be a MemoryLayer doc_id.
    const cachedMeta = getVfsMeta(vfsRef);
    const {metadata, isLoading: rpcLoading} = useDocumentMetadata(cachedMeta ? '' : vfsRef, ws);
    const rpcName = (metadata as {name?: unknown} | null)?.name;
    const fileName: string | null =
        cachedMeta?.file_name || (typeof rpcName === 'string' && rpcName ? rpcName : null);
    const mime: string | null = cachedMeta?.mime ?? null;
    const metaLoading = cachedMeta ? false : rpcLoading;

    const title = fileName || friendlyRefName(vfsRef) || 'Document';
    const kind = previewKindFor(fileName, mime);

    // Only fetch content for previewable (text-based) types, and only once the
    // metadata (→ kind) has resolved — binary types skip to the download prompt.
    const {text, isLoading, error, truncated, reload} = useVfsTextContent(
        kind ? vfsRef : '',
        ws,
    );

    const handleDownload = useCallback(async () => {
        if (!vfsRef || !ws || downloading) return;
        // Open the tab synchronously inside the gesture so the async mint isn't
        // popup-blocked (mirrors the chat file chip's download).
        const win = window.open('', '_blank');
        if (win) win.opener = null;
        setDownloading(true);
        try {
            const mint = buildDownloadUrlFetcher(ws, sendRpcRequest);
            const {url} = await mint(vfsRef, 1);
            if (!url) throw new Error('no url');
            if (win) win.location.href = url;
            else window.location.href = url;
        } catch (e) {
            win?.close();
            console.error('doc-viewer download failed:', e);
        } finally {
            setDownloading(false);
        }
    }, [vfsRef, ws, downloading, sendRpcRequest]);

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="flex-shrink-0 border-b bg-gray-50 px-4 py-2 flex items-center gap-3">
                <FileText size={16} className="text-gray-400 shrink-0"/>
                <h2 className="text-base font-semibold text-gray-700 truncate" title={title}>{title}</h2>
                <div className="ml-auto flex items-center gap-1">
                    {vfsRef && (
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={downloading}
                            title="Download"
                            className="p-1.5 rounded text-gray-600 hover:bg-gray-200 hover:text-gray-800 disabled:text-gray-300 transition-colors"
                        >
                            <Download size={16}/>
                        </button>
                    )}
                    {showCloseButton && onClose && (
                        <AppCloseButton onClose={onClose} label="Document viewer"/>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 flex flex-col">
                {!vfsRef ? (
                    <EmptyState message="No document selected."/>
                ) : metaLoading ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-gray-400 gap-2">
                        <RefreshCw size={16} className="animate-spin"/> Loading document…
                    </div>
                ) : kind === null ? (
                    <UnsupportedState onDownload={handleDownload} downloading={downloading}/>
                ) : isLoading ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-gray-400 gap-2">
                        <RefreshCw size={16} className="animate-spin"/> Loading document…
                    </div>
                ) : error ? (
                    <ErrorState error={error} onRetry={reload} onDownload={handleDownload} downloading={downloading}/>
                ) : text == null ? (
                    <EmptyState message="This document is empty."/>
                ) : (
                    <>
                        {truncated && (
                            <div className="flex-shrink-0 px-4 py-1.5 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                                Preview truncated — this file is large. Download for the full contents.
                            </div>
                        )}
                        {kind === 'markdown' ? (
                            <div className="flex-1 min-h-0 overflow-auto">
                                <div className="max-w-3xl mx-auto px-6 py-5">
                                    <SciMarkdown>{text}</SciMarkdown>
                                </div>
                            </div>
                        ) : kind === 'csv' ? (
                            <div className="flex-1 min-h-0">
                                <CsvView text={text} fileName={fileName} mime={mime}/>
                            </div>
                        ) : (
                            <div className="flex-1 min-h-0 overflow-auto">
                                <pre className="px-4 py-3 text-xs font-mono whitespace-pre-wrap break-words text-gray-800">{text}</pre>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function EmptyState({message}: {message: string}) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2 p-8">
            <FileText size={28} className="opacity-50"/>
            <span className="text-sm">{message}</span>
        </div>
    );
}

function UnsupportedState({onDownload, downloading}: {onDownload: () => void; downloading: boolean}) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-3 p-8 text-center">
            <FileText size={28} className="opacity-50"/>
            <span className="text-sm">Preview isn't available for this file type yet.</span>
            <button
                type="button"
                onClick={onDownload}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
            >
                <Download size={14}/> Download
            </button>
        </div>
    );
}

function ErrorState({
    error,
    onRetry,
    onDownload,
    downloading,
}: {error: string; onRetry: () => void; onDownload: () => void; downloading: boolean}) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3 p-8 text-center">
            <AlertCircle size={28} className="text-red-400"/>
            <span className="text-sm">Couldn't load this document.<br/><span className="text-xs text-gray-400">{error}</span></span>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                    <RefreshCw size={14}/> Retry
                </button>
                <button
                    type="button"
                    onClick={onDownload}
                    disabled={downloading}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                >
                    <Download size={14}/> Download
                </button>
            </div>
        </div>
    );
}
