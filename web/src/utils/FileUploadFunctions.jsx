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

    const uploadFile = useCallback(async ({file, threadId = null, sourcePath = null, ingestFlags = null, onStart, onProgress, onFinish}) => {
        if (!file) return;

        try {
            onStart?.(file);

            // sourcePath (optional) records a grouping path on the VFS entry
            // (e.g. `/Bids/${bidderId}/${file.name}`) so the owning app can
            // list its own files back via a source_path prefix. Distinct from
            // fileName, which stays the display name.
            const {method = 'POST', url, fields = {}, headers = {}, key} = await requestWithRetry({
                file,
                threadId,
                sourcePath,
                ingestFlags,
                sendRpcRequest,
                workspaceId: workspaceId,
            });

            const xhr = new XMLHttpRequest();

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress?.(key, percent);
                }
            };

            xhr.onload = () => {
                // S3 presigned POST returns 204; a presigned PUT (blobgw staging) returns
                // 200 — accept any 2xx.
                if (xhr.status >= 200 && xhr.status < 300) {
                    onFinish?.(key, null); // success
                } else {
                    onFinish?.(key, new Error(`Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => {
                onFinish?.(key, new Error("Upload failed due to a network error."));
            };

            // The backend chooses the upload method and a presigned URL is signed for
            // exactly ONE method — honor it. PUT = raw-bytes presigned PUT (blobgw staging
            // upload); POST = S3 presigned-POST (policy `fields` + the file as FormData).
            if (String(method).toUpperCase() === 'PUT') {
                xhr.open("PUT", url);
                Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
                xhr.send(file);
            } else {
                const formData = new FormData();
                Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
                formData.append("file", file);
                xhr.open("POST", url);
                xhr.send(formData);
            }
        } catch (err) {
            console.error("Upload initiation failed:", err);
            onFinish?.(null, err);
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
