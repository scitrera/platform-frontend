import {useCallback, useEffect, useMemo, useState} from 'react';
import {useWebSocket} from './useWebSocket.jsx';
import {useAuthStore} from '../stores/authStore';
import {CHAT} from '../constants/WebSocketConstants.jsx';

// Metadata is shared by the download widget and image renderer within a tab.
// Tenant and workspace are part of the key; presigned URLs are never cached.
const metadataCache = new Map();

/** Fetch document metadata without reusing a response from another selection. */
export function useDocumentMetadata(docId, workspaceId) {
    const {sendRpcRequest} = useWebSocket();
    const tenantId = useAuthStore(s => s.tenantId);
    const [result, setResult] = useState(null);
    const request = useMemo(() => ({docId, workspaceId, tenantId, sendRpcRequest}),
        [docId, workspaceId, tenantId, sendRpcRequest]);
    const key = JSON.stringify([tenantId, workspaceId, docId]);
    const enabled = Boolean(docId && workspaceId);
    const cached = enabled ? metadataCache.get(key) : null;

    useEffect(() => {
        if (!enabled || metadataCache.has(key)) return;
        let active = true;
        sendRpcRequest(CHAT.FILE_METADATA_GET, {workspaceId, docId})
            .then(metadata => {
                if (!active) return;
                metadataCache.set(key, metadata);
                setResult({request, metadata, error: null});
            })
            .catch(() => {
                if (active) setResult({request, metadata: null, error: 'Failed to load file information'});
            });
        return () => { active = false; };
    }, [enabled, key, request, docId, workspaceId, sendRpcRequest]);

    const current = result?.request === request ? result : null;
    return {
        metadata: enabled ? cached ?? current?.metadata ?? null : null,
        isLoading: enabled && !metadataCache.has(key) && !current,
        error: enabled ? current?.error ?? null : null,
    };
}

/**
 * Mint a presigned download URL for a doc_id via the existing
 * `CHAT.FILE_DOWNLOAD_GET` RPC, with automatic retry. Shared by the
 * download widget (lazy, on click) and the image renderer (eager, on
 * mount).
 *
 * Returned URLs are short-lived (30s server-side default). Callers that
 * need a fresh URL after expiry should re-invoke `mint`.
 *
 * @param {string} workspaceId
 * @param {function} sendRpcRequest - from `useWebSocket()`
 * @returns {function(string, number): Promise<{url: string}>}
 */
export function buildDownloadUrlFetcher(workspaceId, sendRpcRequest) {
    return function mintPresignedDownloadUrl(docId, retries = 1, isActive = () => true) {
        return new Promise((resolve, reject) => {
            let remaining = retries;
            const attempt = () => {
                sendRpcRequest(CHAT.FILE_DOWNLOAD_GET, {
                    workspaceId,
                    docId,
                })
                    .then(resolve)
                    .catch((err) => {
                        if (remaining > 0 && isActive()) {
                            remaining -= 1;
                            attempt();
                        } else {
                            reject(err);
                        }
                    });
            };
            attempt();
        });
    };
}

/**
 * Fetch a short-lived download URL for image rendering. A refresh starts a new
 * request; late replies from an earlier document, workspace, or tenant are ignored.
 */
export function useDocumentPresignedUrl(docId, workspaceId) {
    const {sendRpcRequest} = useWebSocket();
    const tenantId = useAuthStore(s => s.tenantId);
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState(null);
    const refresh = useCallback(() => setRevision(value => value + 1), []);
    const request = useMemo(() => ({docId, workspaceId, tenantId, sendRpcRequest, revision}),
        [docId, workspaceId, tenantId, sendRpcRequest, revision]);
    const enabled = Boolean(docId && workspaceId);

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        const mint = buildDownloadUrlFetcher(workspaceId, sendRpcRequest);
        mint(docId, 1, () => active)
            .then(resp => {
                if (active) setResult({request, url: resp?.url || null, error: null});
            })
            .catch(() => {
                if (active) setResult({request, url: null, error: 'Failed to load file'});
            });
        return () => { active = false; };
    }, [enabled, request, docId, workspaceId, sendRpcRequest]);

    const current = result?.request === request ? result : null;
    return {
        url: enabled ? current?.url ?? null : null,
        isLoading: enabled && !current,
        error: enabled ? current?.error ?? null : null,
        refresh,
    };
}
