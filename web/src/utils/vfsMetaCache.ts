/**
 * Tiny in-tab cache of vfs_ref → file metadata (name + mime).
 *
 * Why this exists: a vfs_ref (data-connectors VFS) and a MemoryLayer doc_id are
 * SEPARATE systems — related but independent — so the ``FILE_METADATA_GET`` RPC
 * (which resolves a MemoryLayer doc_id via ``ml.get_document``) can't look up a
 * bare vfs_ref. But chat file parts already carry the ``file_name``/``mime`` for
 * their vfs_ref, so we remember them here when a chip renders and let the
 * document viewer read them back — the viewer is opened with only the vfs_ref,
 * yet still gets a real name/type without any lookup or extra URL params.
 *
 * Module-level (per tab), so entries survive a chip unmount (e.g. the message
 * scrolled out of view) and the viewer opening as a separate component.
 */

export interface VfsMeta {
    file_name?: string | null;
    mime?: string | null;
}

const cache = new Map<string, VfsMeta>();

/** Remember what we know about a vfs_ref. Merges — a later call with a known
 *  name won't be clobbered by a later call that lacks one. */
export function rememberVfsMeta(vfsRef: string | null | undefined, meta: VfsMeta): void {
    if (!vfsRef) return;
    const prev = cache.get(vfsRef);
    const next: VfsMeta = {
        file_name: meta.file_name ?? prev?.file_name ?? null,
        mime: meta.mime ?? prev?.mime ?? null,
    };
    // Skip a no-op write so we don't churn the map on every re-render.
    if (prev && prev.file_name === next.file_name && prev.mime === next.mime) return;
    cache.set(vfsRef, next);
}

/** Look up cached metadata for a vfs_ref (null when nothing was remembered). */
export function getVfsMeta(vfsRef: string | null | undefined): VfsMeta | null {
    if (!vfsRef) return null;
    return cache.get(vfsRef) ?? null;
}
