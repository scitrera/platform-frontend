/**
 * TypeScript interfaces for the files library app.
 *
 * The FileBrowser component (components/Apps/LibraryFileBrowser.jsx) renders a
 * flat array of file rows. Its documented row shape is
 * ``{ name, modified, size, provider, path, doc_id }`` plus ``vfs_ref`` (used
 * for client-side dedup of optimistic upload rows). ``modified`` is a unix-ms
 * timestamp — the component feeds it to ``new Date(item.modified)``.
 *
 * Source of the raw rows: TenantInterface2.list_files_by_path ->
 * _map_vfs_entry_row (backend/scitrera_app_server/tenant_api/
 * tenant_interface2.py), relayed by the platform-bridge ``files.list`` op as
 * ``{files: rows}``. Rows come from the VFS rather than MemoryLayer because
 * only the VFS records a file's path — ML documents have no path column, so
 * every row previously arrived with path='' and folders could not work.
 */

export interface LibraryFile {
    doc_id: string;
    /** VFS reference: the row's stable identity and download handle.
     *  Preferred over doc_id for selection/delete — it exists from the
     *  moment of upload, whereas doc_id appears only once ingested. */
    vfs_ref?: string;
    name: string;
    /** Data-source/connector provider. */
    provider: string;
    /** True while the upload's bytes are still arriving, i.e. the VFS entry
     *  exists but was never finalized. Derived server-side from the entry
     *  itself, so it cannot be stranded by a missed client-side event. */
    uploading?: boolean;
    size: number;
    path: string;
    /** Last-modified time as unix epoch milliseconds (Date-parseable). */
    modified: number | null;
    created_at?: number | null;
    updated_at?: number | null;
    status?: string | null;
    document_type?: string | null;
}
