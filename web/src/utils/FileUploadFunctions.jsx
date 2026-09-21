// hooks/useFileUploader.jsx
import {useCallback} from "react";
import {CHAT} from "../constants/WebSocketConstants.jsx";
import {useWebSocket} from "../hooks/useWebSocket.jsx";

// import {useAppState} from "../hooks/useAppState.jsx";

export function useFileUploader(workspaceId) {
    const {sendRpcRequest, sendMessage} = useWebSocket();

    /**
     * Trigger user-initiated (BATCH) document ingestion for one or more
     * uploaded files. Each `vfs_ref` is the `key` returned by FILE_UPLOAD_POST.
     * Batched into a single FILE_UPLOAD_COMPLETE message.
     *
     * NOTE: This is the ingest trigger and is independent of the chat
     * `user_file_upload_complete` agent tool call (chat-doc grouping), which
     * still runs on its own path.
     *
     * @param {Array<string|{vfs_ref: string}>} refs - upload keys / vfs_refs.
     * @param {{visibility?: 'workspace'|'private'}} [opts]
     */
    const notifyUploadComplete = useCallback((refs, opts = {}) => {
        const items = (refs || [])
            .map((r) => (typeof r === 'string' ? {vfs_ref: r} : r))
            .filter((it) => it && it.vfs_ref);

        if (items.length === 0) return;

        sendMessage(CHAT.FILE_UPLOAD_COMPLETE, {
            workspace: workspaceId,
            // Default to workspace visibility; structured so a future UI control
            // can pass 'private'.
            visibility: opts.visibility || 'workspace',
            // skip_ingest: commit the blob (so the agent can fetch it) WITHOUT
            // ingesting it into the knowledge base. Chat attachments pass this;
            // Library/ingest uploads leave it false so the doc_added task fires.
            skip_ingest: opts.skipIngest === true,
            items,
        });
    }, [sendMessage, workspaceId]);

    const uploadFile = useCallback(async ({file, threadId = null, sourcePath = null, ingestFlags = null, signal, onStart, onProgress, onFinish}) => {
        if (!file) return;
        let key = null;
        let settled = false;
        let abortUpload;
        const finish = (error) => {
            if (settled) return;
            settled = true;
            if (abortUpload) signal?.removeEventListener('abort', abortUpload);
            onFinish?.(key, error);
        };

        try {
            if (signal?.aborted) {
                finish(new Error('Upload cancelled.'));
                return;
            }
            onStart?.(file);
            const upload = await requestWithRetry({file, threadId, sourcePath, ingestFlags, sendRpcRequest, workspaceId});
            const {method = 'POST', url, fields = {}, headers = {}} = upload;
            key = upload.key;
            // A cancellation during URL creation still needs to report the newly
            // minted reference so the caller can remove its unfinished placeholder.
            if (signal?.aborted) {
                finish(new Error('Upload cancelled.'));
                return;
            }
            const xhr = new XMLHttpRequest();
            xhr.upload.onprogress = (event) => {
                if (!settled && event.lengthComputable) {
                    onProgress?.(key, Math.round((event.loaded / event.total) * 100));
                }
            };
            xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300
                ? null : new Error(`Upload failed with status ${xhr.status}`));
            xhr.onerror = () => finish(new Error('Upload failed due to a network error.'));
            xhr.ontimeout = () => finish(new Error('Upload timed out.'));
            xhr.onabort = () => finish(new Error('Upload cancelled.'));
            abortUpload = () => {
                xhr.abort();
                finish(new Error('Upload cancelled.'));
            };
            signal?.addEventListener('abort', abortUpload, {once: true});

            // Signed PUT sends raw bytes; signed POST sends the supplied form.
            if (String(method).toUpperCase() === 'PUT') {
                xhr.open('PUT', url);
                Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
                xhr.send(file);
            } else {
                const formData = new FormData();
                Object.entries(fields).forEach(([name, value]) => formData.append(name, value));
                formData.append('file', file);
                xhr.open('POST', url);
                xhr.send(formData);
            }
        } catch (error) {
            // Preserve the reference if setup failed AFTER URL creation.
            finish(error);
        }
    }, [sendRpcRequest, workspaceId]);

    return {uploadFile, notifyUploadComplete};
}

// Internal helper function
const requestWithRetry = ({file, retries = 1, threadId, sourcePath, ingestFlags, sendRpcRequest, workspaceId}) => {
    return new Promise((resolve, reject) => {
        const attempt = () => {
            sendRpcRequest(CHAT.FILE_UPLOAD_POST, {
                workspaceId,
                fileName: file.name,
                contentType: file.type,
                fileSize: file.size,
                threadId,
                // omitted when null -> data-connectors defaults source_path to
                // fileName, preserving the previous behaviour exactly
                ...(sourcePath ? {sourcePath} : {}),
                // What the owning app wants done with the file at ingest time
                // (currently `decompose`). Omitted when unset so the backend
                // sees no opinion and applies its own defaults -- an absent
                // flag must not read as a request to disable.
                ...(ingestFlags ? {ingestFlags} : {}),
            })
                .then(resolve)
                .catch((err) => {
                    if (retries > 0) {
                        retries--;
                        attempt();
                    } else {
                        reject(err);
                    }
                });
        };
        attempt();
    });
};
