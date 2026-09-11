/**
 * Fetch a VFS file's raw text for in-app preview.
 *
 * Reuses the same presigned-download-URL mint the chat file chip uses
 * (``FILE_DOWNLOAD_GET`` → ``dc.mint_download_url`` → a browser-reachable
 * ``storage2.scitrera.ai`` URL), then ``fetch()``es it client-side and decodes
 * as UTF-8. The storage bucket's CORS allowlist already includes the app
 * origins, so the cross-origin read succeeds. Minted URLs are short-lived, so
 * the fetch happens immediately after minting.
 */
import {useEffect, useState} from 'react';
import {useWebSocket} from '@/hooks/useWebSocket.jsx';
import {buildDownloadUrlFetcher} from '@/hooks/useDocumentPresignedUrl.jsx';

// Cap the in-browser text preview so a huge file can't wedge the tab. Files
// past this are truncated (the viewer surfaces a notice).
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024; // 5 MB

export interface VfsTextState {
    text: string | null;
    isLoading: boolean;
    error: string | null;
    truncated: boolean;
    reload: () => void;
}

export function useVfsTextContent(vfsRef: string, workspaceId: string): VfsTextState {
    const {sendRpcRequest} = useWebSocket();
    const [text, setText] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [truncated, setTruncated] = useState(false);
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        if (!vfsRef || !workspaceId) {
            setText(null);
            setError(null);
            setIsLoading(false);
            setTruncated(false);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        setText(null);
        setTruncated(false);

        (async () => {
            try {
                const mint = buildDownloadUrlFetcher(workspaceId, sendRpcRequest);
                const {url} = await mint(vfsRef, 1);
                if (!url) throw new Error('no download URL');
                // credentials:'include' sends the session cookie so the edge's
                // auth-bound (`ra`) capability check passes (app2 ↔ storage2 are
                // same-site under scitrera.ai). The storage2 Envoy CORS policy
                // echoes our origin + allowCredentials so the read is permitted.
                const resp = await fetch(url, {credentials: 'include'});
                if (!resp.ok) throw new Error(`fetch failed (${resp.status})`);
                const buf = await resp.arrayBuffer();
                let bytes = new Uint8Array(buf);
                let didTruncate = false;
                if (bytes.length > MAX_PREVIEW_BYTES) {
                    bytes = bytes.slice(0, MAX_PREVIEW_BYTES);
                    didTruncate = true;
                }
                const decoded = new TextDecoder('utf-8', {fatal: false}).decode(bytes);
                if (cancelled) return;
                setText(decoded);
                setTruncated(didTruncate);
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : 'failed to load file');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [vfsRef, workspaceId, sendRpcRequest, nonce]);

    return {text, isLoading, error, truncated, reload: () => setNonce(n => n + 1)};
}
