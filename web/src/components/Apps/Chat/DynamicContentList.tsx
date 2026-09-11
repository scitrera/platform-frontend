import React, {useEffect, useMemo} from 'react';
import {useWorkspaceStore} from '@/stores/workspaceStore';
import {useDocumentPresignedUrl} from '../../../hooks/useDocumentPresignedUrl.jsx';
import {FileDownload} from '../../Widgets/FileDownload.jsx';
import type {DynamicContentBlock} from '@/types/chat';

// Common image styling so inline + doc_id variants look consistent.
//
// `w-auto h-auto` is defensive: some chat-bubble parents apply flex layout
// (or a Tailwind typography plugin's prose styles) that can stretch a child
// `<img>` to the container width, skewing the aspect ratio. Setting both
// dimensions to `auto` forces the browser back to the natural intrinsic
// ratio, then `max-w-full max-h-[480px]` constrains the bounding box.
// `object-contain` is belt-and-suspenders for any container that ends up
// fixing both axes.
const IMG_CLASS = 'block w-auto h-auto max-w-full max-h-[480px] object-contain rounded border border-gray-200 shadow-sm my-2';

interface InlineImageBlockProps {
    mime?: string;
    filename?: string;
    dataBase64?: string;
}

/**
 * Render a single `kind='image'` block that carries its bytes inline as
 * base64. We build one `blob:` URL on mount and revoke it on unmount to
 * avoid leaking browser memory.
 */
function InlineImageBlock({mime, filename, dataBase64}: InlineImageBlockProps) {
    const blobUrl = useMemo(() => {
        if (!dataBase64) return null;
        try {
            // atob + Uint8Array is the most widely supported path. `fetch(`data:...`)` also works
            // but creates an extra roundtrip and won't bypass rehype-harden on the markdown path.
            const binary = atob(dataBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], {type: mime || 'application/octet-stream'});
            return URL.createObjectURL(blob);
        } catch (err) {
            console.error('Failed to decode inline artifact base64:', err);
            return null;
        }
    }, [dataBase64, mime]);

    useEffect(() => {
        return () => {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        };
    }, [blobUrl]);

    if (!blobUrl) {
        return (
            <div className="text-xs text-red-500 my-2">
                Failed to decode inline image{filename ? ` (${filename})` : ''}.
            </div>
        );
    }

    return <img src={blobUrl} alt={filename || 'artifact'} className={IMG_CLASS}/>;
}

interface DocIdImageBlockProps {
    docId: string;
    mime?: string;
    filename?: string;
}

/**
 * Render a single `kind='image'` block referenced by doc_id. Fetches a
 * fresh presigned S3 URL via the existing FILE_DOWNLOAD_GET RPC and
 * renders it as an `<img>`. Token expiry is rare in practice because
 * the browser caches the image bytes after the first load.
 */
function DocIdImageBlock({docId, mime: _mime, filename}: DocIdImageBlockProps) {
    const workspaceId = useWorkspaceStore(s => s.currentWorkspaceId);
    const {url, isLoading, error} = useDocumentPresignedUrl(docId, workspaceId ?? '');

    if (isLoading) {
        return (
            <div className="my-2 h-32 w-full bg-gray-100 rounded animate-pulse"/>
        );
    }
    if (error || !url) {
        return (
            <div className="text-xs text-red-500 my-2">
                Failed to load image{filename ? ` (${filename})` : ''}: {error || 'no URL'}.
            </div>
        );
    }
    return <img src={url} alt={filename || 'artifact'} className={IMG_CLASS}/>;
}

interface DynamicBlockProps {
    block: DynamicContentBlock | null | undefined;
}

/**
 * Render a single dynamic content block based on its `kind`.
 *
 * The server sends blocks FLAT (`{kind, mime, filename, data_base64 | doc_id}`)
 * on both wires:
 *   - live  (CHAT_APPEND_DYNAMIC) — block taken straight off the
 *     CoworkAgent's structured artifact stream;
 *   - history (CHAT_HISTORY)      — `client_interface.py` unwraps each
 *     persisted ``{type: 'dynamic', data: {...}}`` MemoryLayer block via
 *     ``block.get('data')`` before shipping. Both shapes are FLAT here.
 * If a future producer ever leaks the WRAPPED shape through, fall back
 * to ``block.data`` so we don't silently drop the render.
 */
function DynamicBlock({block}: DynamicBlockProps) {
    if (!block) return null;
    // Flat shape (the production case) AND wrapped (defensive fallback).
    const data: DynamicContentBlock = (block && typeof block.data === 'object' && block.data !== null)
        ? (block.data as DynamicContentBlock)
        : block;
    const kind = data.kind;

    if (kind === 'image') {
        if (data.data_base64) {
            return (
                <InlineImageBlock
                    mime={data.mime}
                    filename={data.filename}
                    dataBase64={data.data_base64}
                />
            );
        }
        if (data.doc_id) {
            return (
                <DocIdImageBlock
                    docId={data.doc_id}
                    mime={data.mime}
                    filename={data.filename}
                />
            );
        }
        return null;
    }

    if (kind === 'file' && data.doc_id) {
        return (
            <div className="my-2">
                <FileDownload
                    docId={data.doc_id}
                    altDownloadName={data.filename ?? undefined}
                />
            </div>
        );
    }

    // Unknown kinds are persisted + round-tripped but not rendered yet.
    return null;
}

interface DynamicContentListProps {
    blocks?: DynamicContentBlock[] | null;
}

/**
 * Chat-message dynamic content list. Renders the subset of `msg.dynamic`
 * blocks that v1 knows about: `kind='image'` (inline base64 OR doc_id)
 * and `kind='file'` (doc_id → FileDownload widget). Unknown kinds are
 * skipped but persist across reloads so a future round can render them.
 */
export function DynamicContentList({blocks}: DynamicContentListProps) {
    if (!Array.isArray(blocks) || blocks.length === 0) return null;
    return (
        <div className="mt-2 flex flex-col gap-1">
            {blocks.map((block, idx) => {
                const innerData = (block && typeof block.data === 'object' && block.data !== null)
                    ? (block.data as DynamicContentBlock)
                    : block;
                const keyHint = innerData?.doc_id || innerData?.filename || idx;
                return <DynamicBlock key={String(keyHint)} block={block}/>;
            })}
        </div>
    );
}
