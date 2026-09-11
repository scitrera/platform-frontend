/**
 * Helpers for the in-app document viewer (``doc-viewer``).
 *
 * A chat file chip / artifact can be "viewed" (previewed alongside chat) when
 * its type maps to one of the viewer's sub-renderers. Viewing opens the
 * ``doc-viewer`` app in the MAIN panel with the file's vfs_ref / name / mime
 * carried on the app query params; chat stays in the secondary panel, so the
 * preview sits beside the conversation.
 */
import {useAppPanelStore} from '@/stores/appPanelStore';
import {UI_CONSTANTS} from '@/constants/AppConstants';

export type PreviewKind = 'markdown' | 'csv' | 'text';

const extOf = (name: string): string => {
    const m = /\.([a-z0-9]+)\s*$/i.exec(name.trim());
    return m ? m[1].toLowerCase() : '';
};

// Extensions we render as preformatted plain text (code / config / logs).
const TEXT_EXTS = new Set([
    'txt', 'log', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini', 'env',
    'py', 'js', 'jsx', 'ts', 'tsx', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp',
    'sh', 'bash', 'sql', 'html', 'css', 'scss', 'rb', 'php', 'kt', 'swift',
]);

/**
 * Classify a file into a viewer sub-renderer from its name/mime, or null when
 * there's no in-app preview for it (the chip should offer download only).
 */
export function previewKindFor(fileName?: string | null, mime?: string | null): PreviewKind | null {
    const m = (mime || '').toLowerCase();
    const ext = extOf(fileName || '');

    if (ext === 'md' || ext === 'markdown' || m === 'text/markdown' || m === 'text/x-markdown') {
        return 'markdown';
    }
    if (ext === 'csv' || ext === 'tsv' || m === 'text/csv' || m.includes('tab-separated')) {
        return 'csv';
    }
    if (
        TEXT_EXTS.has(ext)
        || m.startsWith('text/')
        || m === 'application/json'
        || m === 'application/xml'
        || m === 'application/javascript'
    ) {
        return 'text';
    }
    return null;
}

/** True when {@link previewKindFor} recognizes the file (chip shows "View"). */
export function isViewable(fileName?: string | null, mime?: string | null): boolean {
    return previewKindFor(fileName, mime) !== null;
}

/**
 * Open the document viewer for a vfs_ref in the main panel (alongside chat).
 * The viewer takes ONLY the vfs_ref off the app query params and resolves the
 * file's name/type itself (cached FILE_METADATA_GET) — no other metadata is
 * threaded through the URL.
 *
 * The query-param bag is shared across the main + secondary (chat) panels, and
 * loadApp's ``queryParams`` REPLACES it — so we MERGE into the existing bag and
 * set only ``vfs_ref``. A naive replace would drop chat's ``thread`` param and
 * bounce the conversation to a different thread.
 */
export function openDocViewer(opts: {vfsRef: string}): void {
    const store = useAppPanelStore.getState();
    const cur = store.appQueryParams;
    const merged: Record<string, string> = {};
    if (cur instanceof URLSearchParams) {
        cur.forEach((v, k) => {
            merged[k] = v;
        });
    } else if (cur && typeof cur === 'object') {
        Object.assign(merged, cur as Record<string, string>);
    }
    merged.vfs_ref = opts.vfsRef;

    store.loadApp(
        {
            id: UI_CONSTANTS.APP_ID_DOC_VIEWER,
            type: UI_CONSTANTS.APP_TYPE_DOC_VIEWER,
            title: 'Document',
            closeable: true,
        },
        {queryParams: merged},
    );
}
