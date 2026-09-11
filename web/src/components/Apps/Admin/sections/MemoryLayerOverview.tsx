import {useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {WebSocketContext} from '@/contexts/WebSocketContext';
import {adminRpc} from '@/utils/adminRpc';
import {EmptyState} from '../_shared/EmptyState';
import {formatBytes, StatusBadge} from './MemoryLayerShared';
import type {MLOverview, MLStorageUsage, MLTieringRunResult} from '../types';

const POLL_MS = 60_000;

function formatCount(n: number | null | undefined): string {
    if (n == null || Number.isNaN(n)) return '—';
    return n.toLocaleString();
}

function StatCard({label, value}: {label: string; value: ReactNode}) {
    return (
        <div className="rounded-lg border bg-white p-4">
            <div className="text-2xl font-semibold text-gray-900">{value}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">{label}</div>
        </div>
    );
}

/** Tenant-wide MemoryLayer snapshot: aggregate stats + tiering + dependency health. */
export function MemoryLayerOverviewSection() {
    const ws = useContext(WebSocketContext);
    const sendRpcRequest = ws?.sendRpcRequest;

    const [data, setData] = useState<MLOverview | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [preview, setPreview] = useState<MLTieringRunResult | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    // A forced (cache-bypassing) storage-usage result overrides the cached value
    // that rides on the overview payload, until the next full refresh clears it.
    const [forcedStorage, setForcedStorage] = useState<MLStorageUsage | null>(null);
    const [storageRefreshing, setStorageRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        if (!sendRpcRequest) return;
        setLoading(true);
        setError(null);
        try {
            const result = await adminRpc<MLOverview>(sendRpcRequest, 'memorylayer.overview');
            setData(result);
            setForcedStorage(null);  // fall back to the fresh overview's cached storage value
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [sendRpcRequest]);

    const runPreview = useCallback(async () => {
        if (!sendRpcRequest) return;
        setPreviewLoading(true);
        setPreviewError(null);
        try {
            // dry_run + only_enabled=false: count candidates across ALL
            // workspaces (not just cold-tier-enabled ones) so operators can
            // gauge tiering impact before enabling anything. Nothing is archived.
            const result = await adminRpc<MLTieringRunResult>(
                sendRpcRequest, 'memorylayer.tiering_run',
                {dry_run: true, only_enabled: false},
            );
            setPreview(result);
        } catch (e) {
            setPreviewError(e instanceof Error ? e.message : String(e));
        } finally {
            setPreviewLoading(false);
        }
    }, [sendRpcRequest]);

    const refreshStorage = useCallback(async () => {
        if (!sendRpcRequest) return;
        setStorageRefreshing(true);
        try {
            // force=true bypasses the data-connectors cache and recomputes off blobgw.
            const result = await adminRpc<MLStorageUsage>(
                sendRpcRequest, 'memorylayer.storage_usage', {force: true},
            );
            setForcedStorage(result);
        } catch {
            // Keep the prior value on a transient failure — the panel just doesn't update.
        } finally {
            setStorageRefreshing(false);
        }
    }, [sendRpcRequest]);

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, POLL_MS);
        return () => clearInterval(t);
    }, [refresh]);

    const stats = data?.overview ?? null;
    const tiering = data?.tiering ?? null;
    const health = data?.health ?? null;
    const storage = forcedStorage ?? data?.storage ?? null;

    return (
        <div className="flex flex-col h-full overflow-auto p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">MemoryLayer Overview</h2>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {!data && !loading && !error && (
                <EmptyState title="No data" description="MemoryLayer returned no overview data."/>
            )}

            {stats && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
                    <StatCard label="Workspaces" value={formatCount(stats.workspace_count)}/>
                    <StatCard label="Memories" value={formatCount(stats.memory_count)}/>
                    <StatCard label="Sessions" value={formatCount(stats.session_count)}/>
                    <StatCard label="Documents" value={formatCount(stats.document_count)}/>
                    <StatCard label="Datasets" value={formatCount(stats.dataset_count)}/>
                    <StatCard label="Tokens" value={formatCount(stats.token_count)}/>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {data && (
                    <div className="rounded-lg border bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700" title="Measured on-disk bytes on the shared pack substrate (mlfs files + blobgw blobs), via data-connectors → blobgw. Distinct from the DB-relation sizes under Storage Tiering.">
                                Storage Footprint
                            </h3>
                            <button
                                onClick={refreshStorage}
                                disabled={storageRefreshing}
                                className="px-2 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 text-xs"
                                title="Recompute now (bypass the data-connectors cache)"
                            >
                                {storageRefreshing ? 'Refreshing…' : 'Refresh'}
                            </button>
                        </div>
                        {storage ? (
                            <>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <dt className="text-gray-500" title="On-disk after dedup + compression — the effective storage used.">
                                        Effective (on disk)
                                    </dt>
                                    <dd className="text-right font-medium">{formatBytes(storage.physical_bytes)}</dd>
                                    <dt className="text-gray-500" title="Unique content, before compression.">Deduped logical</dt>
                                    <dd className="text-right">{formatBytes(storage.logical_deduped_bytes)}</dd>
                                    {storage.apparent_bytes != null && (
                                        <>
                                            <dt className="text-gray-500" title="Pre-dedup referenced size (duplicates counted): mlfs slice sources + blobgw objects.">Apparent (pre-dedup)</dt>
                                            <dd className="text-right">{formatBytes(storage.apparent_bytes)}</dd>
                                        </>
                                    )}
                                    {storage.file_logical_bytes != null && (
                                        <>
                                            <dt className="text-gray-500" title="Apparent total of mlfs file content (sum of file sizes).">Files (logical)</dt>
                                            <dd className="text-right">{formatBytes(storage.file_logical_bytes)}</dd>
                                        </>
                                    )}
                                    {storage.dedup_ratio != null && (
                                        <>
                                            <dt className="text-gray-500" title="Apparent ÷ deduped — referenced bytes per unique byte.">Dedup ratio</dt>
                                            <dd className="text-right">{`${storage.dedup_ratio.toFixed(2)}×`}</dd>
                                        </>
                                    )}
                                    <dt className="text-gray-500">Compression ratio</dt>
                                    <dd className="text-right">
                                        {storage.compression_ratio != null
                                            ? `${storage.compression_ratio.toFixed(2)}×`
                                            : '—'}
                                    </dd>
                                </dl>
                                {storage.computed_at && (
                                    <p className="mt-3 text-xs text-gray-400">
                                        as of {new Date(storage.computed_at).toLocaleString()}
                                        {storage.cached ? ' (cached)' : ''}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="py-4 text-xs text-gray-400">
                                Storage usage unavailable (data-connectors / blobgw).
                            </p>
                        )}
                    </div>
                )}
                {tiering && (
                    <div className="rounded-lg border bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700">Storage Tiering</h3>
                            <button
                                onClick={runPreview}
                                disabled={previewLoading}
                                className="px-2 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 text-xs"
                                title="Dry run: count how many memories would be archived across all workspaces (nothing is changed)"
                            >
                                {previewLoading ? 'Previewing…' : 'Preview archival'}
                            </button>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <dt className="text-gray-500">Hot memories</dt>
                            <dd className="text-right">{formatCount(tiering.hot_memory_count)}</dd>
                            <dt className="text-gray-500">Cold memories</dt>
                            <dd className="text-right">{formatCount(tiering.cold_memory_count)}</dd>
                            <dt className="text-gray-500">Hot storage</dt>
                            <dd className="text-right">{formatBytes(tiering.hot_storage_bytes)}</dd>
                            <dt className="text-gray-500">Cold storage</dt>
                            <dd className="text-right">{formatBytes(tiering.cold_storage_bytes)}</dd>
                            {tiering.document_storage_bytes != null && (
                                <>
                                    <dt className="text-gray-500" title="Measured on-disk size of the documents + document_pages tables (heap + indexes). Document CHUNKS are memories and count under Hot.">
                                        Document storage
                                    </dt>
                                    <dd className="text-right">{formatBytes(tiering.document_storage_bytes)}</dd>
                                    {tiering.document_pages_bytes != null && (
                                        <>
                                            <dt className="pl-3 text-xs text-gray-400">· pages (transcripts + vectors)</dt>
                                            <dd className="text-right text-xs text-gray-400">{formatBytes(tiering.document_pages_bytes)}</dd>
                                            <dt className="pl-3 text-xs text-gray-400">· documents</dt>
                                            <dd className="text-right text-xs text-gray-400">{formatBytes(tiering.documents_table_bytes ?? 0)}</dd>
                                        </>
                                    )}
                                </>
                            )}
                            <dt className="text-gray-500">Compression ratio</dt>
                            <dd className="text-right">
                                {tiering.compression_ratio != null
                                    ? `${tiering.compression_ratio.toFixed(2)}×`
                                    : '—'}
                            </dd>
                            <dt className="text-gray-500">Est. savings</dt>
                            <dd className="text-right">{formatBytes(tiering.estimated_savings_bytes)}</dd>
                            <dt className="text-gray-500">Archival candidates</dt>
                            <dd className="text-right">{formatCount(tiering.archival_candidates_count)}</dd>
                        </dl>
                        {tiering.cold_memory_count === 0 && (
                            <p className="mt-3 text-xs text-gray-400">
                                Cold tier is empty — no memories have been archived yet. Cold
                                counts populate once the tiering job runs (or memories are
                                archived on demand).
                            </p>
                        )}
                        {previewError && (
                            <p className="mt-2 text-xs text-red-600">{previewError}</p>
                        )}
                        {preview && (
                            <p className="mt-2 text-xs text-gray-600">
                                Dry run: {preview.total_candidates.toLocaleString()} memor
                                {preview.total_candidates === 1 ? 'y' : 'ies'} eligible for
                                archival across {preview.workspaces_processed} workspace
                                {preview.workspaces_processed === 1 ? '' : 's'} (nothing was changed).
                            </p>
                        )}
                    </div>
                )}

                {health && (
                    <div className="rounded-lg border bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700">Dependencies</h3>
                            <StatusBadge status={health.status}/>
                        </div>
                        <ul className="divide-y text-sm">
                            {Object.entries(health.dependencies || {}).map(([name, dep]) => (
                                <li key={name} className="flex items-center justify-between py-2">
                                    <span className="capitalize text-gray-700">{name}</span>
                                    <StatusBadge status={dep.status}/>
                                </li>
                            ))}
                            {Object.keys(health.dependencies || {}).length === 0 && (
                                <li className="py-2 text-gray-400">No dependency details reported.</li>
                            )}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
