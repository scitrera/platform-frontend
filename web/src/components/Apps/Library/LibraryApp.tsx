import {useLibraryState} from '@/hooks/useLibraryState';
import LibraryFileBrowser from '../LibraryFileBrowser.jsx';
import {AppCloseButton} from '../AppCloseButton';

interface LibraryAppProps {
    workspaceId: string;
    panelConfig: unknown;
    showCloseButton?: boolean;
    onClose?: () => void;
}

export default function LibraryApp({workspaceId, showCloseButton, onClose}: LibraryAppProps) {
    const {files, loading, error, deleteFiles, loadFiles} = useLibraryState();

    // Initial data load is owned by LibraryContext (connection-aware: loads once
    // the socket is connected + a workspace is selected, and reloads on workspace
    // change). No mount-time load here — it would race the socket.

    const hasFiles = files.length > 0;

    const renderBody = () => {
        if (loading && !hasFiles) {
            return (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                    Loading...
                </div>
            );
        }

        if (error && !hasFiles) {
            return (
                <div className="flex-1 flex items-center justify-center text-sm text-red-500 px-6 text-center">
                    {error}
                </div>
            );
        }

        // FileBrowser owns folder navigation, breadcrumbs, upload (via its own
        // data-connectors service-proxy + FILE_UPLOAD_COMPLETE path), download,
        // multi-select, and "Reference in Chat". We only feed it data + delete +
        // refresh from the context. Folder-create has no backend op yet, so it is
        // left unwired (the component's create-folder button is commented out and
        // ``onSyncMetadata``/``onIngest`` are intentionally omitted — same as the
        // old agent-rendered library.jsx).
        return (
            <div className="flex-1 min-h-0 overflow-auto p-2">
                <LibraryFileBrowser
                    data={files}
                    workspaceId={workspaceId}
                    onDelete={deleteFiles}
                    refreshFunction={loadFiles}
                    // No backend op for these yet — the component guards each
                    // (``onSyncMetadata && ...`` etc.) so undefined is a no-op,
                    // matching the old agent-rendered library.jsx wiring.
                    onSyncMetadata={undefined}
                    onIngest={undefined}
                    onUploadCompletion={undefined}
                />
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="flex-shrink-0 border-b bg-gray-50 px-4 py-2 flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-700">Library</h2>
                {showCloseButton && onClose && (
                    <AppCloseButton onClose={onClose} label="Library" className="ml-auto"/>
                )}
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 flex flex-col">
                {renderBody()}
            </div>
        </div>
    );
}
